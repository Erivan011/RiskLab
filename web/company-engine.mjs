// All disclosure values remain in BRL thousands until presentation.
export function reconcileDisclosure(disclosure) {
  if (!Array.isArray(disclosure?.positions) || !disclosure.positions.length ||
      disclosure.positions.some(p=>!Number.isFinite(p.value)||!['asset','liability','derivative'].includes(p.kind)))
    throw new Error('Divulgação inválida.');
  const sum=rows=>rows.reduce((total,p)=>total+p.value,0);
  const positions=disclosure.positions;
  const assets=sum(positions.filter(p=>p.value>0));
  const liabilities=sum(positions.filter(p=>p.value<0));
  const net=assets+liabilities;
  const nonDerivativeNet=sum(positions.filter(p=>p.kind!=='derivative'));
  const derivativeFairValue=sum(positions.filter(p=>p.kind==='derivative'));
  const expected=disclosure.reported;
  const reconciled=Boolean(expected)&&[assets-expected.assets,liabilities-expected.liabilities,net-expected.net].every(x=>Math.abs(x)<.5);
  return {assets,liabilities,net,nonDerivativeNet,derivativeFairValue,reconciled};
}
export function companyShock(disclosure, shock) {
  if(!Number.isFinite(shock)||shock<=-1||shock>1) throw new Error('Choque deve ser maior que −100% e até 100%.');
  const base=reconcileDisclosure(disclosure);
  if(!base.reconciled) throw new Error('O recorte não reconcilia com a divulgação.');
  const effects=disclosure.positions.filter(p=>p.kind!=='derivative').map(p=>({...p,effect:p.value*shock}));
  return {...base,shock,effects,accountingEffect:effects.reduce((s,p)=>s+p.effect,0),stressedRate:disclosure.exchangeRate*(1+shock)};
}
