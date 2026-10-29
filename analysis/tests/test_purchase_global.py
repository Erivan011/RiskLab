import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('purchase_pipeline',Path(__file__).resolve().parents[1]/'scripts/purchase_pipeline.py')
pipeline=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)

class GlobalPurchases(unittest.TestCase):
    def test_global_generation_is_deterministic_and_brl_is_fixed(self):
        rows=pipeline.generate()
        self.assertEqual(rows,pipeline.generate())
        self.assertEqual(len(rows),800)
        self.assertEqual(len({r['country'] for r in rows}),20)
        self.assertEqual(len({r['currency'] for r in rows}),10)
        for r in rows:
            if r['currency']=='BRL':
                self.assertEqual(r['budgetFx'],1)
                self.assertEqual(r['actualFx'],1)
    def test_legacy_schema_migration_and_repeated_load(self):
        with tempfile.TemporaryDirectory() as d:
            db=Path(d)/'legacy.sqlite';out=Path(d)/'report.json'
            con=sqlite3.connect(db)
            con.execute('CREATE TABLE fact_purchase(id TEXT PRIMARY KEY, sku TEXT, category TEXT, supplier TEXT, currency TEXT, order_date TEXT, promised_date TEXT, delivery_date TEXT, due_date TEXT, paid_date TEXT, budget_qty INTEGER, actual_qty INTEGER, budget_price REAL, actual_price REAL, budget_fx REAL, actual_fx REAL, budget_brl REAL, actual_brl REAL)')
            con.commit();con.close()
            with contextlib.redirect_stdout(io.StringIO()):
                pipeline.run(out,db);pipeline.run(out,db)
            result=json.loads(out.read_text())
            self.assertEqual(result['run']['changedRows'],0)
            self.assertEqual(result['run']['unchangedRows'],800)
            con=sqlite3.connect(db)
            total=con.execute('SELECT SUM(actual_brl) FROM fact_purchase').fetchone()[0]
            self.assertAlmostEqual(total,result['run']['actualBrl'],places=2)
            self.assertEqual(con.execute("SELECT COUNT(DISTINCT country) FROM fact_purchase").fetchone()[0],20)
            con.close()
