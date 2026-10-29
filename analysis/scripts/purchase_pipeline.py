"""Seeded demonstration purchase history. All business values are synthetic."""
import argparse
import calendar
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import random
import sqlite3

AS_OF = date(2026, 10, 28)
SEED = 202610
CATEGORIES = ['Sensores', 'Conectores', 'Placas', 'Instrumentação']
SUPPLIERS = ['Kanto', 'Nordwerk', 'Han River', 'Lumière', 'Pacific', 'Bristol', 'Torino', 'Alpine']
FX = {'USD': 5.2, 'EUR': 6.0, 'GBP': 7.0}


def generate():
    rng = random.Random(SEED)
    rows = []
    for month in range(1, 11):
        for sku in range(24):
            currency = ['USD', 'EUR', 'GBP'][sku % 3]
            category = CATEGORIES[sku % 4]
            supplier = SUPPLIERS[sku % 8]
            for batch in range(2):
                order = date(2026, month, 2+batch*12+sku%6)
                if order > AS_OF:
                    continue
                supplier_index = (sku + batch + month//3) % 8
                supplier = SUPPLIERS[supplier_index]
                planned = round((24+sku*2)*(1+.18*month/10)*(1+.12*(month in [3,6,9])))
                # Documented mechanisms, not patterns learned from real businesses.
                volume_factor = 1+.08*(month>=7)+.12*(sku%4==2 and month>=6)
                quantity = max(1, round(planned*volume_factor*rng.uniform(.88,1.12)))
                budget_price = round(8+sku*.9, 2)
                actual_price = round(budget_price*(1+.045*(supplier_index==2)+.035*(month>=7)-.02*(supplier_index==5))*rng.uniform(.98,1.02), 4)
                budget_fx = FX[currency]
                invoice_fx = round(budget_fx*(1+.012*month+.025*(currency=='USD' and month>=8)), 4)
                promised = order+timedelta(days=10+sku%8)
                delay = max(-3, round(rng.gauss(-3+9*(supplier_index==2)+3*(month>=7), 4)))
                delivery = promised+timedelta(days=delay)
                delivered = delivery if delivery<=AS_OF else None
                due = order+timedelta(days=30+sku%3*15)
                paid = due+timedelta(days=max(0,round(rng.gauss(3+18*(supplier_index==2 and month>=7),5))))
                paid = paid if paid<=AS_OF else None
                rows.append(dict(id=f'PO26-{month:02}-{sku:02}-{batch}', sku=f'SKU-{sku:03}',
                    category=category,supplier=supplier,currency=currency,orderDate=order.isoformat(),
                    promisedDate=promised.isoformat(),deliveryDate=delivered.isoformat() if delivered else None,
                    dueDate=due.isoformat(),paidDate=paid.isoformat() if paid else None,
                    budgetQty=planned,actualQty=quantity,budgetPrice=budget_price,actualPrice=actual_price,
                    budgetFx=budget_fx,actualFx=invoice_fx,
                    budgetBrl=round(planned*budget_price*budget_fx,2),actualBrl=round(quantity*actual_price*invoice_fx,2)))
    return rows


def run(output, database):
    rows = generate()
    assert len({r['id'] for r in rows})==len(rows)
    assert all(r['budgetQty']>0 and r['actualQty']>0 and r['actualFx']>0 for r in rows)
    payload_hash = hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()
    db = sqlite3.connect(database)
    with db:
        db.executescript('''DROP TABLE IF EXISTS fact_purchase;
        CREATE TABLE fact_purchase(id TEXT PRIMARY KEY, sku TEXT, category TEXT, supplier TEXT, currency TEXT,
         order_date TEXT, promised_date TEXT, delivery_date TEXT, due_date TEXT, paid_date TEXT,
         budget_qty INTEGER, actual_qty INTEGER, budget_price REAL, actual_price REAL, budget_fx REAL,
         actual_fx REAL, budget_brl REAL, actual_brl REAL);
        CREATE TABLE IF NOT EXISTS purchase_runs(id INTEGER PRIMARY KEY, executed_at TEXT, rows INTEGER, sha256 TEXT);
        ''')
        columns=list(rows[0])
        db.executemany('INSERT INTO fact_purchase VALUES('+','.join('?' for _ in columns)+')',
          [tuple(r[k] for k in columns) for r in rows])
        executed = datetime.now(timezone.utc).isoformat()
        db.execute('INSERT INTO purchase_runs VALUES(NULL,?,?,?)',(executed,len(rows),payload_hash))
        monthly=[dict(month=m,orders=n,budgetBrl=b,actualBrl=a) for m,n,b,a in db.execute('''
          SELECT substr(order_date,1,7),COUNT(*),ROUND(SUM(budget_brl),2),ROUND(SUM(actual_brl),2)
          FROM fact_purchase GROUP BY 1 ORDER BY 1''')]
        suppliers=[dict(supplier=s,orders=n,actualBrl=a) for s,n,a in db.execute('''
          SELECT supplier,COUNT(*),ROUND(SUM(actual_brl),2) FROM fact_purchase GROUP BY 1 ORDER BY 3 DESC''')]
    report = {'schemaVersion':1,'asOf':AS_OF.isoformat(),'sourceKind':'synthetic','seed':SEED,
      'disclosure':'Todos os pedidos, valores, preços, câmbio faturado, fornecedores, pagamentos e entregas desta área são sintéticos. Não são dados de uma empresa real nem cotações BCB.',
      'generationRules':['24 SKUs, 8 fornecedores, 4 categorias e 3 moedas; duas remessas por mês de janeiro a outubro de 2026.',
       'Volume aumenta a partir de julho; placas têm aumento adicional a partir de junho.',
       'Han River tem atraso médio simulado maior; variações são geradas com semente fixa.',
       'Entregas e pagamentos posteriores à data de corte são nulos e tratados como pendentes, nunca como pontuais.'],
      'run':{'executedAt':executed,'rows':len(rows),'sha256':payload_hash,'invalidRows':0,'duplicateIds':0,
       'budgetBrl':round(sum(r['budgetBrl'] for r in rows),2),'actualBrl':round(sum(r['actualBrl'] for r in rows),2)},
      'monthly':monthly,'suppliers':suppliers,'rows':rows}
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')))
    print(json.dumps(report['run']))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=Path,default=Path('web/purchase-research.json'))
    p.add_argument('--database',type=Path,default=Path('/tmp/risklab-purchases.sqlite'))
    args=p.parse_args();args.database.parent.mkdir(parents=True,exist_ok=True);run(args.output,args.database)
