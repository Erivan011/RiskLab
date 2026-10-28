import {analyzePortfolio} from './portfolio-analytics.mjs';
self.onmessage=event=>{
  try{self.postMessage({id:event.data.id,result:analyzePortfolio(event.data.input)});}
  catch(error){self.postMessage({id:event.data.id,error:error.message});}
};
