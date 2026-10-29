"""Materialize V4 model results from the existing synchronized BCB snapshot."""
import argparse
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import sys
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from risklab.terminal_models import tail_metrics,coverage_diagnostics,conditional_paths


def run(source,output):
    payload=source.read_bytes();raw=json.loads(payload)
    maps={c:{p['date']:p['value'] for p in raw['currencies'][c]['points']} for c in ['USD','EUR','GBP']}
    dates=sorted(set.intersection(*(set(m) for m in maps.values())))
    return_dates=dates[1:];split=next(i for i,d in enumerate(return_dates) if d>='2026-01-01')
    result={'version':1,'generatedAt':datetime.now(timezone.utc).isoformat(),'sourceSha256':hashlib.sha256(payload).hexdigest(),
      'source':'BCB/SGS snapshot; synchronized observed dates','sourceCheckedAt':raw.get('checkedAt'),
      'asOf':dates[-1],'confidence':.99,'window':252,'dfStudent':5,'evaluationStart':return_dates[split],
      'lossConvention':'Positive FX return is a loss for an unhedged BRL payer. Rates below are fractions of a hypothetical BRL exposure, one observed period.',
      'currencies':{}}
    for currency,m in maps.items():
        returns=np.array([m[dates[i]]/m[dates[i-1]]-1 for i in range(1,len(dates))])
        evaluation=returns[split:];paths=conditional_paths(returns[split-60:split],evaluation)
        forecasts={k:[] for k in ['gaussian','cornish_fisher','student']};exceptions={k:[] for k in forecasts}
        for i in range(split,len(returns)):
            stats=tail_metrics(returns[i-252:i]);
            for k in forecasts:
                forecasts[k].append(stats[k])
                if returns[i]>stats[k]:exceptions[k].append({'date':return_dates[i],'trainingEnd':return_dates[i-1],'lossRate':float(returns[i]),'forecastRate':stats[k]})
        monthly={}
        for day,pred in zip(return_dates[split:],paths['predictions']):
            monthly[day[:7]]={'month':day[:7],'ewma':float(np.sqrt(pred['ewma']*252)),'garch':float(np.sqrt(pred['garch']*252))}
        result['currencies'][currency]={'spot':m[dates[-1]],'latest':tail_metrics(returns[-252:]),
          'backtests':{k:{**coverage_diagnostics(evaluation,values),'exceptions':exceptions[k]} for k,values in forecasts.items()},
          'volatility':{'monthly':list(monthly.values()),'parameters':{k:v for k,v in paths.items() if k!='predictions'},
            'scores':{model:{'rmseVariance':float(np.sqrt(np.mean([(p[model]-r*r)**2 for p,r in zip(paths['predictions'],evaluation)]))),
              'meanQlike':float(np.mean([np.log(p[model])+r*r/p[model] for p,r in zip(paths['predictions'],evaluation)]))} for model in ['ewma','garch']}}}
    output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'),allow_nan=False))
    print('Materialized',len(result['currencies']),'currencies through',result['asOf'])


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input',type=Path,default=Path('web/market-snapshot.json'));p.add_argument('--output',type=Path,default=Path('web/terminal-quant-report.json'));a=p.parse_args();run(a.input,a.output)
