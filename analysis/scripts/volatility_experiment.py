"""Chronological 2026 evaluation of fixed-parameter variance forecasts from SQLite."""
import argparse
import csv
import json
import math
import sqlite3
from pathlib import Path


def evaluate(database, currency):
    with sqlite3.connect(database) as db:
        # Inner join across dates ensures the same observations as the browser.
        prices = db.execute('''SELECT q.date, q.price FROM quotes q
          JOIN (SELECT date FROM quotes GROUP BY date HAVING COUNT(DISTINCT currency)=3) d
          ON q.date=d.date WHERE q.currency=? ORDER BY q.date''', (currency,)).fetchall()
        returns = [(prices[i][0], prices[i][1]/prices[i-1][1]-1) for i in range(1,len(prices))]
        split = next(i for i, (day, _) in enumerate(returns) if day >= '2026-01-01')
        if split < 60 or len(returns)-split < 20:
            raise ValueError('Insufficient training or evaluation data')
        squares = [r*r for _, r in returns]
        baseline = max(1e-12, sum(squares[split-60:split])/60)
        ewma = baseline
        output = []
        for i in range(split, len(returns)):
            forecasts = {'baseline': baseline, 'rolling20': max(1e-12, sum(squares[i-20:i])/20), 'ewma': ewma}
            for model, predicted in forecasts.items():
                output.append({'currency': currency, 'date': returns[i][0], 'training_end': returns[i-1][0],
                  'model': model, 'predicted_variance': predicted, 'observed_squared_return': squares[i],
                  'qlike': math.log(predicted)+squares[i]/predicted, 'squared_error': (predicted-squares[i])**2})
            ewma = max(1e-12, .94*ewma+.06*squares[i])
        db.execute('''CREATE TABLE IF NOT EXISTS volatility_evaluation (
          currency TEXT, date TEXT, training_end TEXT, model TEXT, predicted_variance REAL,
          observed_squared_return REAL, qlike REAL, squared_error REAL,
          PRIMARY KEY(currency,date,model), CHECK(training_end<date))''')
        db.executemany('INSERT OR REPLACE INTO volatility_evaluation VALUES(?,?,?,?,?,?,?,?)',
          [tuple(r.values()) for r in output])
    return output


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--database', type=Path, required=True)
    p.add_argument('--currency', choices=['USD','EUR','GBP'], default='USD')
    p.add_argument('--csv', type=Path)
    args = p.parse_args()
    rows = evaluate(args.database, args.currency)
    if args.csv:
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        with args.csv.open('w', newline='') as f:
            writer=csv.DictWriter(f, fieldnames=rows[0].keys()); writer.writeheader(); writer.writerows(rows)
    result=[]
    for model in ['baseline','rolling20','ewma']:
        items=[r for r in rows if r['model']==model]
        result.append({'model':model,'observations':len(items),
          'rmse_variance':math.sqrt(sum(r['squared_error'] for r in items)/len(items)),
          'mean_qlike':sum(r['qlike'] for r in items)/len(items)})
    print(json.dumps(result, indent=2))
