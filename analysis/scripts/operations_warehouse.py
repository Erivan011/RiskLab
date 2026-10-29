"""Load the demonstration portfolio into a dimensional SQLite model."""
import argparse
import json
import sqlite3
from pathlib import Path


def load(source, database):
    data = json.loads(Path(source).read_text())
    rows = data['operations']
    if len({r['id'] for r in rows}) != len(rows):
        raise ValueError('Duplicate operation identifiers')
    with sqlite3.connect(database) as db:
        db.execute('PRAGMA foreign_keys=ON')
        db.executescript('''
        CREATE TABLE IF NOT EXISTS dim_supplier(id INTEGER PRIMARY KEY, name TEXT UNIQUE, country TEXT);
        CREATE TABLE IF NOT EXISTS dim_category(id INTEGER PRIMARY KEY, name TEXT UNIQUE);
        CREATE TABLE IF NOT EXISTS dim_currency(code TEXT PRIMARY KEY);
        CREATE TABLE IF NOT EXISTS dim_calendar(date TEXT PRIMARY KEY, year INTEGER, month INTEGER);
        CREATE TABLE IF NOT EXISTS fact_operation(
          operation_id TEXT PRIMARY KEY, supplier_id INTEGER REFERENCES dim_supplier(id),
          category_id INTEGER REFERENCES dim_category(id), currency TEXT REFERENCES dim_currency(code),
          due_date TEXT REFERENCES dim_calendar(date), status TEXT,
          foreign_amount REAL CHECK(foreign_amount>=0), budget_rate REAL CHECK(budget_rate>0),
          hedge_percent REAL CHECK(hedge_percent BETWEEN 0 AND 100), hedge_rate REAL,
          local_cost_brl REAL CHECK(local_cost_brl>=0), portfolio_as_of TEXT);
        ''')
        for r in rows:
            db.execute('INSERT INTO dim_supplier(name,country) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET country=excluded.country', (r['supplier'], r.get('country')))
            db.execute('INSERT OR IGNORE INTO dim_category(name) VALUES(?)', (r['category'],))
            db.execute('INSERT OR IGNORE INTO dim_currency VALUES(?)', (r['currency'],))
            day = r['dueDate']
            db.execute('INSERT OR IGNORE INTO dim_calendar VALUES(?,?,?)', (day, int(day[:4]), int(day[5:7])))
            supplier = db.execute('SELECT id FROM dim_supplier WHERE name=?', (r['supplier'],)).fetchone()[0]
            category = db.execute('SELECT id FROM dim_category WHERE name=?', (r['category'],)).fetchone()[0]
            db.execute('''INSERT OR REPLACE INTO fact_operation VALUES(?,?,?,?,?,?,?,?,?,?,?,?)''',
              (r['id'], supplier, category, r['currency'], day, r['status'], r['amount'],
               r['budgetRate'], r['hedgePercent'], r['hedgeRate'], r.get('localCostBrl', 0), data['asOf']))
    return len(rows)


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input', type=Path, required=True)
    p.add_argument('--database', type=Path, required=True)
    a = p.parse_args()
    a.database.parent.mkdir(parents=True, exist_ok=True)
    print(json.dumps({'operations_loaded': load(a.input, a.database)}))
