"""Independent NumPy reference for the portfolio model; optionally persists test rows to SQLite."""
import argparse
import json
import math
import sqlite3
from pathlib import Path
import numpy as np

ROOT=Path(__file__).resolve().parents[2]

def reference(dataset, policy):
    rows=dataset['assets']
    returns=np.array([row['values'] for row in rows],dtype=float)
    target=np.array([.5,.3,.2]);holdings=target.copy()
    wealth=10000.;benchmark=10000.;fee_sum=0.;window=252;confidence=.95
    evaluation=[]
    for i,row in enumerate(rows):
        if row['date']<'2023-01-01' or i<window:continue
        pre=target.copy() if policy=='daily' else holdings.copy()
        turnover=float(np.abs(target-holdings).sum()) if policy=='daily' else 0.
        cost=wealth*turnover*.0005
        historical_losses=-(returns[i-window:i] @ pre)
        var=float(np.quantile(historical_losses,confidence,method='linear'))
        es=float(historical_losses[historical_losses>=var].mean())
        gross=float(returns[i] @ pre)
        net=(1-turnover*.0005)*(1+gross)-1
        wealth*=1+net;benchmark*=1+float(returns[i,0]);fee_sum+=cost
        holdings=pre*(1+returns[i])/(1+gross)
        evaluation.append({'date':row['date'],'trainingEnd':rows[i-1]['date'],'varRate':var,'esRate':es,'grossReturn':gross,'netReturn':net,'wealth':wealth,'benchmarkWealth':benchmark,'feePaid':cost,'breach':-gross>var})
    risk_weights=target if policy=='daily' else holdings
    covariance=np.cov(returns[-window:],rowvar=False,ddof=1)
    sigma=float(np.sqrt(risk_weights @ covariance @ risk_weights))
    components=risk_weights*(covariance @ risk_weights)/sigma*np.sqrt(252)
    losses=-(returns[-window:] @ risk_weights)
    var=float(np.quantile(losses,confidence,method='linear'))
    tail=losses>=var
    es_components=-risk_weights*returns[-window:][tail].mean(axis=0)
    curve=np.array([10000.]+[row['wealth'] for row in evaluation])
    drawdown=curve/np.maximum.accumulate(curve)-1
    flags=[row['breach'] for row in evaluation];n=len(flags);x=sum(flags);alpha=.05
    def ll(probability):
        return (x*math.log(probability) if x else 0)+((n-x)*math.log1p(-probability) if n-x else 0)
    lr=max(0,2*(ll(x/n)-ll(alpha)))
    return {'policy':policy,'evaluation':evaluation,'ending':wealth,'benchmarkEnding':benchmark,
            'totalFees':fee_sum,'endingWeights':holdings.tolist(),'annualizedVolatility':sigma*np.sqrt(252),
            'volatilityComponents':components.tolist(),'esComponents':es_components.tolist(),
            'varRate':var,'esRate':float(losses[tail].mean()),'maxDrawdown':float(drawdown.min()),
            'kupiecPValue':math.erfc(math.sqrt(lr/2))}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',default=str(ROOT/'tests/portfolio-reference.json'));parser.add_argument('--sqlite')
    args=parser.parse_args();dataset=json.loads((ROOT/'web/dataset.json').read_text())
    results=[reference(dataset,policy) for policy in ['daily','buyhold']]
    Path(args.output).write_text(json.dumps(results,separators=(',',':')))
    if args.sqlite:
        with sqlite3.connect(args.sqlite) as db:
            db.execute('DROP TABLE IF EXISTS portfolio_forecasts')
            db.execute('CREATE TABLE portfolio_forecasts(case_id TEXT,date TEXT,training_end TEXT,gross_return REAL,net_return REAL,wealth REAL,benchmark_wealth REAL,var_rate REAL,loss REAL,breach INTEGER,fee_paid REAL,initial_capital REAL,CHECK(training_end<date),PRIMARY KEY(case_id,date))')
            for result in results:
                db.executemany('INSERT INTO portfolio_forecasts VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[(result['policy'],r['date'],r['trainingEnd'],r['grossReturn'],r['netReturn'],r['wealth'],r['benchmarkWealth'],r['varRate'],-r['grossReturn'],int(r['breach']),r['feePaid'],10000.) for r in result['evaluation']])
    print('NumPy reference generated:',sum(len(r['evaluation']) for r in results),'daily evaluations')

if __name__=='__main__':main()
