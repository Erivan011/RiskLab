import test from 'node:test';
import assert from 'node:assert/strict';
import {MARKET_GROUPS,MARKET_WIDGET_SCRIPT,marketWidgetConfig} from '../web/global-market-config.mjs';
test('market widget configuration sends a public symbol allowlist, never cash portfolio data',()=>{
 for(const [key,group]of Object.entries(MARKET_GROUPS)){
  const config=marketWidgetConfig(key,'dark');
  assert.equal(config.tabs.length,1);assert.equal(config.width,'100%');
  assert.equal(new Set(group.symbols.map(symbol=>symbol.s)).size,group.symbols.length);
  assert.deepEqual(config.tabs[0].symbols,group.symbols);
  for(const symbol of group.symbols)assert.match(symbol.s,/^[A-Z0-9_]+:[A-Z0-9!._]+$/);
  assert.doesNotMatch(JSON.stringify(config),/openingCash|receipts|supplier|api.?key|token/i);
 }
 assert.equal(new URL(MARKET_WIDGET_SCRIPT).hostname,'s3.tradingview.com');
 assert.throws(()=>marketWidgetConfig('not-an-approved-group'));
 assert.throws(()=>marketWidgetConfig('indices','unexpected-theme'));
});
test('global markets are served separately from the dated simulation and preserve attribution',async()=>{
 const {default:worker}=await import('../worker/index.js');
 const landing=await worker.fetch(new Request('https://risklab.test/'));
 const html=await landing.text();assert.match(html,/id="mercados"/);assert.match(html,/não alimenta automaticamente a simulação/);
 assert.match(html,/Mercados por TradingView/);assert.match(html,/id="market-provider-status"/);
 for(const name of ['global-markets.mjs','global-market-config.mjs']){
  const asset=await worker.fetch(new Request('https://risklab.test/'+name));assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/text\/javascript/);
 }
});
