/** Deterministic, long-only research model. No network, DOM or wall-clock inputs. */
export const ANALYTICS_VERSION = '1.0.0';
const total = values => values.reduce((sum, value) => sum + value, 0);
const average = values => total(values) / values.length;
const dot = (a, b) => total(a.map((value, i) => value * b[i]));
const validIso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0,10) === value;

export function empiricalQuantile(values, probability) {
  const ordered = [...values].sort((a,b) => a-b);
  const position = (ordered.length-1) * probability;
  const low = Math.floor(position), high = Math.ceil(position);
  return ordered[low] + (ordered[high]-ordered[low]) * (position-low);
}
function tailRisk(history, weights, confidence) {
  const losses = history.map(row => -dot(weights, row.values));
  const varRate = empiricalQuantile(losses, confidence);
  const tail = losses.map((loss,index) => ({loss,index})).filter(row => row.loss >= varRate);
  return {varRate, esRate: average(tail.map(row => row.loss)), tail, losses};
}
function erfcApprox(value) {
  const t=1/(1+.3275911*value);
  return (((((1.061405429*t-1.453152027)*t+1.421413741)*t-.284496736)*t+.254829592)*t)*Math.exp(-value*value);
}
export function coverageTest(flags, confidence) {
  if(!Array.isArray(flags)||!flags.length||![.95,.99].includes(confidence))throw Error('Amostra ou confiança inválida.');
  const n=flags.length, breaches=flags.filter(Boolean).length, alpha=1-confidence;
  const logLikelihood = probability =>
    (breaches ? breaches*Math.log(probability) : 0) +
    (n-breaches ? (n-breaches)*Math.log1p(-probability) : 0);
  const lr=Math.max(0,2*(logLikelihood(breaches/n)-logLikelihood(alpha)));
  return {observations:n,breaches,expectedBreaches:n*alpha,breachRate:breaches/n,
    likelihoodRatio:lr,kupiecPValue:erfcApprox(Math.sqrt(lr/2))};
}
function validateInput(input) {
  const {rows,assetNames,weights,window,confidence,capital,feeBps,policy,benchmarkIndex,startDate,endDate}=input;
  const n=assetNames?.length;
  if(!Number.isInteger(n)||n<2||n>12||new Set(assetNames).size!==n||assetNames.some(name=>typeof name!=='string'||!name.trim()||name.length>48||/[\r\n]/.test(name)))
    throw Error('Use de 2 a 12 ativos com nomes distintos de até 48 caracteres.');
  if(!Array.isArray(weights)||weights.length!==n||weights.some(w=>!Number.isFinite(w)||w<0||w>1)||Math.abs(total(weights)-1)>1e-8)
    throw Error('Os pesos precisam ser não negativos e somar exatamente 100%.');
  if(!Number.isInteger(window)||window<20||window>1000||![.95,.99].includes(confidence)||
    !Number.isFinite(capital)||capital<=0||capital>1e9||!Number.isFinite(feeBps)||feeBps<0||feeBps>100||
    !['daily','buyhold'].includes(policy)||!Number.isInteger(benchmarkIndex)||benchmarkIndex < -1||benchmarkIndex>=n)
    throw Error('Configuração de janela, confiança, capital, custos ou referência inválida.');
  if((startDate&&!validIso(startDate))||(endDate&&!validIso(endDate))||(startDate&&endDate&&startDate>endDate))
    throw Error('Confira as datas de avaliação.');
  if(!Array.isArray(rows)||rows.length<window+2||rows.length>5000)
    throw Error('Histórico insuficiente para a janela ou superior a 5.000 observações.');
  let previous='';
  for(const row of rows){
    if(!validIso(row.date)||row.date<=previous||!Array.isArray(row.values)||row.values.length!==n||row.values.some(v=>!Number.isFinite(v)||v<=-1))
      throw Error('Retornos inválidos: use datas crescentes, distintas e valores finitos maiores que −100%.');
    previous=row.date;
  }
}
function marketContributions(history, weights, confidence) {
  const columns=weights.map((_,j)=>history.map(row=>row.values[j]));
  const means=columns.map(average);
  const covariance=columns.map((a,i)=>columns.map((b,j)=>
    total(a.map((value,k)=>(value-means[i])*(b[k]-means[j])))/(a.length-1)));
  for(const row of covariance)for(let j=0;j<row.length;j++)if(Math.abs(row[j])<1e-24)row[j]=0;
  const covWithPortfolio=covariance.map(row=>dot(row,weights));
  const variance=Math.max(0,dot(weights,covWithPortfolio)),sigma=Math.sqrt(variance);
  const risk=tailRisk(history,weights,confidence);
  const components=weights.map((weight,j)=>({
    weight,volatilityContribution:sigma?weight*covWithPortfolio[j]/sigma*Math.sqrt(252):0,
    volatilityShare:sigma?weight*covWithPortfolio[j]/variance:null,
    esContribution:-weight*average(risk.tail.map(t=>history[t.index].values[j])),
  }));
  return {annualizedVolatility:sigma*Math.sqrt(252),dailyVolatility:sigma,covariance,
    correlation:covariance.map((row,i)=>row.map((v,j)=>covariance[i][i]>0&&covariance[j][j]>0?
      Math.max(-1,Math.min(1,v/Math.sqrt(covariance[i][i]*covariance[j][j]))):null)),
    varRate:risk.varRate,esRate:risk.esRate,tailCount:risk.tail.length,components};
}
function pathStatistics(rows, capital, returnKey, wealthKey) {
  const returns=rows.map(row=>row[returnKey]),avg=average(returns);
  const variance=total(returns.map(value=>(value-avg)**2))/(returns.length-1);
  let peak=capital,maxDrawdown=0;
  const drawdowns=rows.map(row=>{peak=Math.max(peak,row[wealthKey]);const value=row[wealthKey]/peak-1;maxDrawdown=Math.min(maxDrawdown,value);return value;});
  const ending=rows.at(-1)[wealthKey];
  return {cumulativeReturn:ending/capital-1,annualizedReturn:(ending/capital)**(252/rows.length)-1,
    annualizedVolatility:Math.sqrt(Math.max(0,variance))*Math.sqrt(252),maxDrawdown,ending,drawdowns};
}

export function analyzePortfolio(raw) {
  const input={window:252,confidence:.95,capital:10000,feeBps:5,policy:'daily',benchmarkIndex:0,...raw};
  validateInput(input);
  const {rows,weights,window,confidence,capital,feeBps,policy,benchmarkIndex,startDate,endDate}=input;
  const indices=rows.map((row,index)=>({row,index})).filter(({row,index})=>index>=window&&(!startDate||row.date>=startDate)&&(!endDate||row.date<=endDate));
  if(indices.length<2)throw Error('O período deve conter ao menos dois dias avaliáveis após o treinamento.');
  let holdings=[...weights],wealth=capital,benchmarkWealth=capital,totalFees=0;
  const evaluation=[];
  for(const {row,index} of indices){
    // Rebalance uses only the drift already observed at the preceding close.
    const preTradeWeights=policy==='daily'?[...weights]:[...holdings];
    const turnover=policy==='daily'?total(weights.map((weight,j)=>Math.abs(weight-holdings[j]))):0;
    const feeRate=turnover*feeBps/10000,feePaid=wealth*feeRate;
    const history=rows.slice(index-window,index);
    const risk=tailRisk(history,preTradeWeights,confidence);
    const grossReturn=dot(preTradeWeights,row.values);
    const netReturn=(1-feeRate)*(1+grossReturn)-1;
    const benchmarkReturn=benchmarkIndex===-1?average(row.values):row.values[benchmarkIndex];
    wealth*=1+netReturn;benchmarkWealth*=1+benchmarkReturn;totalFees+=feePaid;
    if(!Number.isFinite(wealth)||!Number.isFinite(benchmarkWealth)||wealth<=0||benchmarkWealth<=0)throw Error('O patrimônio saiu do intervalo numérico. Confira preços e ajustes da série.');
    holdings=preTradeWeights.map((weight,j)=>weight*(1+row.values[j])/(1+grossReturn));
    evaluation.push({date:row.date,trainingStart:history[0].date,trainingEnd:history.at(-1).date,
      grossReturn,netReturn,benchmarkReturn,wealth,benchmarkWealth,turnover,feePaid,
      varRate:risk.varRate,esRate:risk.esRate,loss:-grossReturn,breach:-grossReturn>risk.varRate,
      preTradeWeights});
  }
  const lastIndex=indices.at(-1).index;
  const riskWeights=policy==='daily'?[...weights]:[...holdings];
  const diagnostic=marketContributions(rows.slice(lastIndex-window+1,lastIndex+1),riskWeights,confidence);
  const performance=pathStatistics(evaluation,capital,'netReturn','wealth');
  const benchmark=pathStatistics(evaluation,capital,'benchmarkReturn','benchmarkWealth');
  const coverage=coverageTest(evaluation.map(row=>row.breach),confidence);
  const empiricalWorst=rows.slice(lastIndex-window+1,lastIndex+1).reduce((worst,row)=>
    dot(riskWeights,row.values)<dot(riskWeights,worst.values)?row:worst);
  const flags=[];
  if(diagnostic.tailCount<5)flags.push('A cauda da janela contém menos de cinco observações; a estimativa de ES é pouco estável.');
  if(evaluation.length<250)flags.push('Menos de 250 observações avaliadas; o teste de cobertura tem amostra curta.');
  if(input.source?.kind==='user_prices')flags.push('Preços importados: ajuste por dividendos, splits e moeda-base não é verificado automaticamente.');
  const largestMove=rows.reduce((m,row)=>Math.max(m,...row.values.map(Math.abs)),0);
  if(largestMove>.5)flags.push('Há variação diária superior a 50%; confira preços e ajustes de eventos corporativos.');
  return {version:ANALYTICS_VERSION,input,assetNames:[...input.assetNames],weights:[...weights],riskWeights,
    observations:evaluation.length,evaluation,diagnostic,performance,benchmark,coverage,totalFees,
    benchmarkLabel:benchmarkIndex===-1?'1/N diário, sem custos':input.assetNames[benchmarkIndex],
    startDate:evaluation[0].date,endDate:evaluation.at(-1).date,initialDate:rows[indices[0].index-1].date,
    asOf:rows[lastIndex].date,endingWeights:holdings,concentration:Math.max(...riskWeights),
    empiricalWorst:{date:empiricalWorst.date,shocks:[...empiricalWorst.values]},flags};
}
export function portfolioStress(result, shocks) {
  if(!Array.isArray(shocks)||shocks.length!==result.riskWeights.length||shocks.some(v=>!Number.isFinite(v)||v<=-1||v>1))
    throw Error('Choques devem estar entre mais de −100% e +100%, um por ativo.');
  const pnlByAsset=result.riskWeights.map((weight,j)=>result.performance.ending*weight*shocks[j]);
  const pnl=total(pnlByAsset);
  return {shocks:[...shocks],pnlByAsset,pnl,returnRate:pnl/result.performance.ending,
    stressedValue:result.performance.ending+pnl};
}

function csvRecords(text, delimiter) {
  const records=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(char==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;
    }else if(char===delimiter&&!quoted){row.push(cell);cell='';}
    else if((char==='\n'||char==='\r')&&!quoted){
      if(char==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);if(row.some(value=>value.trim()))records.push(row);row=[];cell='';
    }else cell+=char;
    if(records.length>5002)throw Error('CSV excede 5.001 linhas de preços.');
  }
  if(quoted)throw Error('CSV com aspas não fechadas.');
  row.push(cell);if(row.some(value=>value.trim()))records.push(row);
  return records;
}
export function parsePriceCsv(text) {
  if(typeof text!=='string'||text.length>2e6)throw Error('Use um CSV de até 2 MB.');
  text=text.replace(/^\uFEFF/,'');
  const firstLine=text.split(/\r?\n/,1)[0],delimiter=firstLine.includes(';')?';':',';
  const records=csvRecords(text,delimiter),headers=records.shift()?.map(value=>value.trim());
  if(!headers||!['date','data'].includes(headers[0].toLowerCase())||headers.length<3||headers.length>13)
    throw Error('Cabeçalho esperado: date,ATIVO_1,ATIVO_2 (de 2 a 12 ativos).');
  const assetNames=headers.slice(1);
  if(new Set(assetNames.map(name=>name.toLowerCase())).size!==assetNames.length||assetNames.some(name=>!name||name.length>48||/[\r\n]/.test(name)))
    throw Error('Nomes de ativos ausentes, duplicados ou longos demais.');
  const prices=[];let excludedRows=0,previous='';
  for(let i=0;i<records.length;i++){
    const row=records[i].map(value=>value.trim()),date=row[0];
    if(row.length!==headers.length||!validIso(date)||date<=previous)throw Error(`Linha ${i+2}: colunas ou datas inválidas. Ordene datas ISO crescentes, sem duplicatas.`);
    previous=date;
    const values=row.slice(1).map(value=>{
      if(!value)return null;
      if(!/^\d+(?:[.,]\d+)?$/.test(value))throw Error(`Linha ${i+2}: preço inválido; não use separadores de milhar.`);
      const number=Number(value.replace(',','.'));
      if(!Number.isFinite(number)||number<=0)throw Error(`Linha ${i+2}: preços devem ser positivos.`);
      return number;
    });
    if(values.includes(null)){excludedRows++;continue;}
    prices.push({date,values});
  }
  if(prices.length<23)throw Error('Poucos preços completos para uma avaliação histórica.');
  const rows=prices.slice(1).map((row,index)=>({date:row.date,values:row.values.map((price,j)=>price/prices[index].values[j]-1)}));
  return {assetNames,rows,quality:{priceRows:records.length,commonPriceRows:prices.length,
    excludedRows,firstPriceDate:prices[0].date,lastPriceDate:prices.at(-1).date}};
}
