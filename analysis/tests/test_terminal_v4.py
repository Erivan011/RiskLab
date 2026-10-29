"""Boundary and anti-leakage checks for the integrated V4 additions."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import numpy as np
from risklab.terminal_models import tail_metrics,coverage_diagnostics,conditional_paths,forward_illustration


class TerminalV4Tests(unittest.TestCase):
    def test_future_return_does_not_change_issued_forecasts(self):
        training=np.linspace(-.01,.01,60);observed=np.array([.01,-.01,.02])
        first=conditional_paths(training,observed)['predictions']
        observed[-1]=.9
        self.assertEqual(first,conditional_paths(training,observed)['predictions'])

    def test_tail_es_is_above_matching_t_var_and_invalid_data_fail(self):
        values=np.random.default_rng(20).normal(0,.01,400)
        result=tail_metrics(values)
        self.assertGreaterEqual(result['student_es'],result['student'])
        with self.assertRaises(ValueError):tail_metrics([float('nan')]*30)
        with self.assertRaises(ValueError):tail_metrics(values,df=2)

    def test_degenerate_transitions_not_reported_as_approval(self):
        result=coverage_diagnostics([0.]*100,[.1]*100)
        self.assertIsNone(result['independenceP'])
        self.assertNotIn('model_accepted_95pct',result)
        self.assertTrue(np.isfinite(result['kupiecP']))

    def test_forward_separates_business_and_calendar_day_counts(self):
        a=forward_illustration(5.714,.1125,.0485,63,90)
        b=forward_illustration(5.714,.1125,.0485,63,63)
        self.assertLess(a,b)
        self.assertEqual(forward_illustration(5,0,0,63,90),5)
        with self.assertRaises(ValueError):forward_illustration(-1,.1,.05,63,90)

    def test_incremental_purchase_pipeline_repeated_load_changes_no_rows(self):
        path=Path(__file__).resolve().parents[1]/'scripts'/'purchase_pipeline.py'
        spec=importlib.util.spec_from_file_location('purchase_pipeline',path)
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        import json
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/'data.json';db=Path(d)/'data.sqlite'
            module.run(out,db);first=json.loads(out.read_text())
            module.run(out,db);second=json.loads(out.read_text())
            self.assertEqual(first['run']['changedRows'],480)
            self.assertEqual(second['run']['changedRows'],0)
            self.assertEqual(second['run']['unchangedRows'],480)
            self.assertEqual(first['run']['sha256'],second['run']['sha256'])
            self.assertTrue(any('USING INDEX' in p for p in second['run']['queryPlan']))


if __name__=='__main__':unittest.main()
