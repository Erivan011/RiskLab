import { analyzeTrade } from './trade-engine.mjs';
/** First adverse parallel FX shock that produces a negative daily net cash balance. */
export function liquidityBoundary(input, maximum = .2) {
  const run = shock => analyzeTrade({...input,shocks:{USD:shock,EUR:shock,GBP:shock}});
  const base=run(0);
  if(base.minimumCashCents<0)return {status:'already_short',shock:0,analysis:base};
  const stressed=run(maximum);
  if(stressed.minimumCashCents>=0)return {status:'not_reached',shock:maximum,analysis:stressed};
  let low=0,high=maximum;
  for(let i=0;i<32;i++){const mid=(low+high)/2;if(run(mid).minimumCashCents<0)high=mid;else low=mid;}
  return {status:'threshold',shock:high,analysis:run(high)};
}
export function paymentLadder(analysis){
 return analysis.cash.filter(day=>day.scenarioCents>0).map(day=>({...day,operations:analysis.rows.filter(row=>(row.dueDate<analysis.asOf?analysis.asOf:row.dueDate)===day.date)}));
}
