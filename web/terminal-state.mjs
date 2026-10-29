export function replayCutoff(month,asOf){
 if(!Number.isInteger(month)||month<1||month>12)throw Error('Mês inválido.');
 const year=Number(asOf.slice(0,4)),last=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
 return last<asOf?last:asOf;
}
export function observedPurchases(rows,cutoff){
 return rows.filter(row=>row.orderDate<=cutoff).map(row=>({...row,
  deliveryDate:row.deliveryDate&&row.deliveryDate<=cutoff?row.deliveryDate:null,
  paidDate:row.paidDate&&row.paidDate<=cutoff?row.paidDate:null}));
}
export function commandMatches(commands,query){const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return commands.filter(c=>normalize(c.label+' '+(c.keywords||'')).includes(normalize(query.trim())));}
