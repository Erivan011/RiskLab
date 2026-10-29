/** Keyed chart transitions: interpolate the rendered state, never recompute metrics. */
let generation=0;
let preference;
try{preference=localStorage.getItem('risklab.motion');}catch{}
export function motionEnabled(){return preference==='full'||(preference!=='reduced'&&!matchMedia('(prefers-reduced-motion: reduce)').matches);}
export const easeOutCubic=t=>1-(1-Math.max(0,Math.min(1,t)))**3;
export function motionValue(from,to,progress){return from+(to-from)*easeOutCubic(progress);}
export function installMotionPreference(onChange){
 const button=document.getElementById('motion-toggle');
 function sync(){const enabled=motionEnabled();document.body.dataset.motion=enabled?'full':'reduced';button.textContent=enabled?'Movimento: ativo':'Ativar movimento';button.setAttribute('aria-pressed',String(enabled));button.title=enabled?'Desativar animações':'Ativar animações, inclusive se o sistema preferir movimento reduzido';}
 button.onclick=()=>{preference=motionEnabled()?'reduced':'full';try{localStorage.setItem('risklab.motion',preference);}catch{}sync();onChange?.();};
 matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',()=>{sync();onChange?.();});sync();
}
const attributes=['x','y','width','height','cx','cy','r','opacity'];
function state(element){const result={};for(const attr of attributes){const raw=element.getAttribute(attr);if(raw!==null&&Number.isFinite(Number(raw)))result[attr]=Number(raw);}for(const prop of (element.dataset.motionStyle||'').split(' ').filter(Boolean)){const raw=element.style[prop];if(raw?.endsWith('%'))result['style:'+prop]=parseFloat(raw);}return result;}
export function captureChartMotion(root){return new Map([...root.querySelectorAll('[data-motion-key]')].map(element=>[element.dataset.motionKey,state(element)]));}
export function animateWorkspace(root,previous,{viewChanged=false}={}){
 const id=++generation;root.dataset.motionPhase='settled';
 if(!motionEnabled())return;
 const jobs=[];
 root.querySelectorAll('[data-motion-key]').forEach((element,index)=>{
  const target=state(element),old=previous.get(element.dataset.motionKey),from={...target};
  if(old){for(const key of Object.keys(target))if(Number.isFinite(old[key]))from[key]=old[key];}
  else if(element.tagName.toLowerCase()==='rect'&&'height'in target){from.height=0;from.y=target.y+target.height;}
  else if(element.tagName.toLowerCase()==='circle'){from.r=0;from.opacity=0;}
  else {if('style:width'in target)from['style:width']=0;}
  if(Object.keys(target).some(key=>from[key]!==target[key]))jobs.push({element,from,target,delay:old?0:Math.min(index*12,150)});
 });
 function apply(job,t){for(const [key,to]of Object.entries(job.target)){const value=motionValue(job.from[key],to,t);if(key.startsWith('style:'))job.element.style[key.slice(6)]=value+'%';else job.element.setAttribute(key,String(value));}}
 jobs.forEach(job=>apply(job,0));
 if(viewChanged){root.querySelectorAll('.panel,.kpi').forEach((panel,index)=>panel.animate([{opacity:0,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,delay:Math.min(index*28,180),easing:'cubic-bezier(.16,1,.3,1)',fill:'backwards'}));}
 root.querySelectorAll('svg path').forEach(path=>{
  if(!path.getAttribute('d')||path.getAttribute('fill')!=='none')return;
  try{const length=path.getTotalLength();if(length>0)path.animate([{strokeDasharray:String(length),strokeDashoffset:String(length)},{strokeDasharray:String(length),strokeDashoffset:'0'}],{duration:850,easing:'cubic-bezier(.16,1,.3,1)'});}catch{}
 });
 if(!jobs.length)return;root.dataset.motionPhase='animating';let start=null;
 function frame(now){if(id!==generation||!root.isConnected)return;if(start===null)start=now;let done=true;for(const job of jobs){if(!job.element.isConnected)continue;const p=Math.max(0,Math.min(1,(now-start-job.delay)/600));apply(job,p);if(p<1)done=false;}if(done)root.dataset.motionPhase='settled';else requestAnimationFrame(frame);}
 requestAnimationFrame(frame);
}
