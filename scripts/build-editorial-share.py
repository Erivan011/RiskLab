"""Regenerate the exact 1200x627 social image from the shared cash-flow engine."""
import json
import subprocess
from datetime import date
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
source = """
import {readFileSync} from 'node:fs';
import {editorialState} from './design/editorial-model.mjs';
const demo=JSON.parse(readFileSync('web/trade-demo.json'));
const market=JSON.parse(readFileSync('web/market-snapshot.json'));
const rates=Object.fromEntries(['USD','EUR','GBP'].map(c=>[c,market.currencies[c].points.filter(p=>p.date<=demo.asOf).at(-1).value]));
const input={operations:demo.operations,receipts:demo.receipts,asOf:demo.asOf,openingCashBrl:demo.openingCashBrl,rates,horizon:90};
const state=editorialState(input,.1);
console.log(JSON.stringify({input,base:state.base,analysis:state.analysis}));
"""
data = json.loads(subprocess.run(['node','--input-type=module','-e',source],capture_output=True,text=True,check=True).stdout)
paper, ink, muted, risk = '#101210','#e1e2d8','#a0a496','#e3a179'
fig=plt.figure(figsize=(12,6.27),dpi=100,facecolor=paper)
fig.text(.06,.92,'RiskLab.    /    TRADE RESEARCH',fontfamily='DejaVu Serif',fontsize=16,color=ink)
fig.text(.94,.92,'ESTUDO DEMONSTRATIVO',ha='right',fontfamily='DejaVu Sans Mono',fontsize=8,color=muted)
fig.text(.06,.81,'Se o dólar subir 10%,\no caixa aguenta?',va='top',fontfamily='DejaVu Serif',fontsize=34,color=ink,linespacing=1.15)
fig.text(.06,.59,'Câmbio. Vencimentos. Liquidez.',fontsize=12,color=muted)
ax=fig.add_axes([.07,.13,.86,.37],facecolor=paper)
asof=date.fromisoformat(data['input']['asOf'])
for key,color,width in [('base','#87927b',1.5),('analysis',risk,2.4)]:
    analysis=data[key]
    x=[0]+[(date.fromisoformat(p['date'])-asof).days for p in analysis['cash']]
    y=[analysis['openingCashCents']/100000]+[p['scenarioBalanceCents']/100000 for p in analysis['cash']]
    ax.step(x,y,where='post',color=color,lw=width)
ax.axhline(0,color='#6d7663',ls=':',lw=.8)
ax.set_xlim(0,90)
ax.set_xticks([0,30,60,90])
ax.set_xticklabels(['27 out','26 nov','26 dez','25 jan'])
ax.yaxis.set_major_formatter(FuncFormatter(lambda value,pos:f'{value:.0f} mil'))
ax.tick_params(axis='both',labelsize=9,colors=muted,length=0,pad=9)
for spine in ax.spines.values():spine.set_visible(False)
ax.grid(axis='y',color='#30362c',lw=.6)
ax.set_axisbelow(True)
fig.text(.06,.035,'Carteira fictícia · referência BCB/SGS datada · sem previsão de mercado',fontsize=9,color=muted)
fig.savefig('web/editorial-share.png',dpi=100,facecolor=paper)
plt.close(fig)
