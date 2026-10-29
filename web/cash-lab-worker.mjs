import {simulateCash} from './cash-bootstrap.mjs';
self.onmessage=({data})=>{try{self.postMessage({id:data.id,results:[0,50,100].map(coverage=>simulateCash({...data,coverage}))});}catch(error){self.postMessage({id:data.id,error:error.message});}};
