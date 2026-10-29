/** Research kernels: explicit temporal boundaries and no fitted hyperparameters. */
const mean = values => values.reduce((a,b)=>a+b,0)/values.length;
const quantile = (values,p) => {
  const sorted=[...values].sort((a,b)=>a-b), position=(sorted.length-1)*p;
  return sorted[Math.floor(position)]+(sorted[Math.ceil(position)]-sorted[Math.floor(position)])*(position%1);
};
export function decomposeBudget(rows,rates){
  const contributions=rows.map(row=>{
    const fx=row.amount*(rates[row.currency]-row.budgetRate);
    const fixing=row.amount*(row.hedgePercent/100)*(row.hedgeRate-rates[row.currency]);
    return {id:row.id,currency:row.currency,supplier:row.supplier,fx,fixing,total:fx+fixing};
  });
  const sum=key=>contributions.reduce((s,r)=>s+r[key],0);
  const positive=contributions.reduce((s,r)=>s+Math.max(0,r.total),0);
  const negative=contributions.reduce((s,r)=>s+Math.min(0,r.total),0);
  return {contributions,fx:sum('fx'),fixing:sum('fixing'),net:sum('total'),positive,negative,
    offsetShare:positive+Math.abs(negative)?1-Math.abs(sum('total'))/(positive+Math.abs(negative)):0};
}
export function evaluateVolatility(rows,index,{start='2026-01-01',lambda=.94}={}){
  if(!Array.isArray(rows)||rows.length<81||![0,1,2].includes(index)||lambda<=0||lambda>=1)throw Error('Histórico ou parâmetros inválidos.');
  let previous='';
  for(const r of rows){if(r.date<=previous||!Number.isFinite(r.values[index]))throw Error('Retornos devem ser finitos e cronológicos.');previous=r.date;}
  const split=rows.findIndex(r=>r.date>=start);
  if(split<60||rows.length-split<20)throw Error('São necessários 60 retornos anteriores e 20 posteriores à data de avaliação.');
  const returns=rows.map(r=>r.values[index]),squares=returns.map(r=>r*r),floor=1e-12;
  // All model parameters are fixed before evaluation; baseline never sees test data.
  const baseline=Math.max(floor,mean(squares.slice(split-60,split)));
  let ewma=baseline;const evaluation=[];
  for(let i=split;i<rows.length;i++){
    const rolling=Math.max(floor,mean(squares.slice(i-20,i)));
    const thresholds=returns.slice(i-60,i).map(Math.abs);
    const threshold=quantile(thresholds,.99);
    evaluation.push({date:rows[i].date,trainingEnd:rows[i-1].date,realizedSquared:squares[i],returnRate:returns[i],
      predictions:{baseline,rolling20:rolling,ewma},threshold,alert:Math.abs(returns[i])>threshold});
    ewma=Math.max(floor,lambda*ewma+(1-lambda)*squares[i]);
  }
  const names={baseline:'Constante · treino anterior',rolling20:'Média móvel · 20 observações',ewma:'EWMA · λ = 0,94'};
  const loss=(row,key)=>Math.log(row.predictions[key])+row.realizedSquared/row.predictions[key];
  const baselineLoss=mean(evaluation.map(r=>loss(r,'baseline')));
  const models=Object.keys(names).map(key=>({key,name:names[key],rmse:Math.sqrt(mean(evaluation.map(r=>(r.predictions[key]-r.realizedSquared)**2))),
    relativeQlike:mean(evaluation.map(r=>loss(r,key)))-baselineLoss,
    lossDifferenceCI:key==='baseline'?[0,0]:blockMeanInterval(evaluation.map(r=>loss(r,key)-loss(r,'baseline')))}));
  return {index,start,trainingStart:rows[split-60].date,trainingEnd:rows[split-1].date,first:evaluation[0].date,last:evaluation.at(-1).date,
    observations:evaluation.length,models,evaluation,alerts:evaluation.filter(r=>r.alert),lambda,blockLength:5,bootstrapReplicates:1000};
}
export function blockMeanInterval(differences,{seed=2026,repetitions=1000,blockLength=5}={}){
  let state=seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const estimates=[];
  for(let b=0;b<repetitions;b++){
    const sample=[];
    while(sample.length<differences.length){const start=Math.floor(random()*differences.length);for(let j=0;j<blockLength&&sample.length<differences.length;j++)sample.push(differences[(start+j)%differences.length]);}
    estimates.push(mean(sample));
  }
  return [quantile(estimates,.025),quantile(estimates,.975)];
}
