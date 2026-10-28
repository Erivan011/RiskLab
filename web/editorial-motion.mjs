/** Motion is presentation-only. Monetary results always come from the domain model. */
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => motionPreference.matches;
const amountFrames = new WeakMap();
let curveFrame = 0;

export function animateMoney(element, targetCents, format, prefix = '') {
  cancelAnimationFrame(amountFrames.get(element));
  const start = Number(element.dataset.amount ?? targetCents);
  const region = element.closest('[aria-live]');
  const update = value => {
    element.dataset.amount = String(value);
    element.textContent = prefix + format(value / 100);
  };
  if (reducedMotion() || start === targetCents) {
    update(targetCents); region?.removeAttribute('aria-busy'); return;
  }
  region?.setAttribute('aria-busy', 'true');
  const started = performance.now();
  function frame(now) {
    const t = reducedMotion() ? 1 : Math.min(1, (now - started) / 260);
    update(start + (targetCents - start) * (1 - (1 - t) ** 3));
    if (t < 1) amountFrames.set(element, requestAnimationFrame(frame));
    else { update(targetCents); region?.removeAttribute('aria-busy'); }
  }
  amountFrames.set(element, requestAnimationFrame(frame));
}

export function animateProfile(svg, previousPath, intro = false) {
  cancelAnimationFrame(curveFrame);
  const path = svg.querySelector('path:last-of-type');
  if (!path || reducedMotion()) return;
  if (intro) {
    const length = path.getTotalLength();
    path.animate([{strokeDasharray: `${length}`, strokeDashoffset: length},
      {strokeDasharray: `${length}`, strokeDashoffset: 0}],
      {duration: 1000, easing: 'cubic-bezier(.2,.65,.25,1)'});
    return;
  }
  const target = path.getAttribute('d');
  if (!previousPath || previousPath === target) return;
  const coordinates = /-?\d+(?:\.\d+)?/g;
  const from = previousPath.match(coordinates)?.map(Number);
  const to = target.match(coordinates)?.map(Number);
  if (!from || !to || from.length !== to.length) return;
  const started = performance.now();
  function frame(now) {
    if (!path.isConnected) return;
    const t = reducedMotion() ? 1 : Math.min(1, (now - started) / 230);
    const eased = 1 - (1 - t) ** 3;
    let i = 0;
    path.setAttribute('d', target.replace(coordinates, () => {
      const value = from[i] + (to[i] - from[i]) * eased; i++; return value.toFixed(2);
    }));
    if (t < 1) curveFrame = requestAnimationFrame(frame);
    else path.setAttribute('d', target);
  }
  curveFrame = requestAnimationFrame(frame);
}

export function installChartProbe(svg, state, input, format) {
  const wrap = svg.parentElement;
  let tooltip = wrap.querySelector('.chart-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('output'); tooltip.className = 'chart-tooltip';
    tooltip.hidden = true; wrap.append(tooltip);
  }
  const namespace = 'http://www.w3.org/2000/svg';
  const group = document.createElementNS(namespace, 'g');
  group.classList.add('chart-probe'); group.setAttribute('aria-hidden', 'true'); group.style.display = 'none';
  group.innerHTML = '<line stroke="var(--muted)" stroke-dasharray="2 4"/><circle r="4" fill="var(--risk)" stroke="var(--paper)" stroke-width="2"/>';
  svg.append(group);
  const scale = svg.querySelector('[data-profile-scale]').dataset;
  const low = Number(scale.low), high = Number(scale.high), padding = Number(scale.padding);
  const x = date => 53 + (Date.parse(date) - Date.parse(input.asOf)) / (86400000 * input.horizon) * 647;
  const y = value => 281 - (value - low + padding) / (high - low + 2 * padding) * 252;
  const days = state.analysis.cash;
  let selected = 0;
  const dateLabel = date => new Intl.DateTimeFormat('pt-BR', {day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  function show(index, keyboard = false) {
    selected = Math.max(0, Math.min(days.length - 1, index));
    const day = days[selected], px = x(day.date), py = y(day.scenarioBalanceCents);
    const line = group.querySelector('line'), circle = group.querySelector('circle');
    for (const [key,value] of Object.entries({x1:px,x2:px,y1:29,y2:281})) line.setAttribute(key,value);
    circle.setAttribute('cx',px); circle.setAttribute('cy',py); group.style.display = '';
    tooltip.textContent = `${dateLabel(day.date)} · saldo ${format(day.scenarioBalanceCents/100)} · saída ${format(day.scenarioCents/100)}`;
    tooltip.hidden = false;
    tooltip.style.left = Math.max(0,Math.min(wrap.clientWidth-tooltip.offsetWidth,px/760*wrap.clientWidth-tooltip.offsetWidth/2))+'px';
    if (keyboard) document.getElementById('chart-accessible-status').textContent = tooltip.textContent;
  }
  function point(event) {
    const matrix = svg.getScreenCTM(); if (!matrix) return;
    const position = svg.createSVGPoint(); position.x = event.clientX; position.y = event.clientY;
    const local = position.matrixTransform(matrix.inverse());
    const target = Math.max(0,Math.min(1,(local.x-53)/647))*input.horizon;
    const targetDate = Date.parse(input.asOf)+target*86400000;
    let index = 0;
    for (let i=0;i<days.length;i++) if (Date.parse(days[i].date)<=targetDate) index=i;
    show(index);
  }
  function hide(){ group.style.display='none'; tooltip.hidden=true; }
  svg.setAttribute('tabindex','0');
  svg.setAttribute('aria-describedby','chart-keyboard-help');
  svg.onpointermove=point; svg.onpointerdown=point;
  svg.onpointerleave=hide; svg.onblur=hide;
  svg.onkeydown=event=>{
    if(event.key==='Escape'){hide();return;}
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    show(event.key==='Home'?0:event.key==='End'?days.length-1:selected+(event.key==='ArrowRight'?1:-1),true);
  };
}

export function startEditorialMotion() {
  if (reducedMotion()) return;
  document.querySelectorAll('.lead h1,.lead>p,.answer,.plot-column').forEach((element,index)=>
    element.animate([{opacity:.3,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],
      {duration:650,delay:index*65,easing:'cubic-bezier(.2,.7,.2,1)'}));
  motionPreference.addEventListener('change',()=>{
    if(reducedMotion())document.querySelectorAll('.lead h1,.lead>p,.answer,.plot-column,.main-plot path,.waterfall rect').forEach(element=>element.getAnimations().forEach(animation=>animation.cancel()));
  });
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(entries=>entries.forEach(entry=>{
    if(!entry.isIntersecting)return;
    entry.target.dataset.revealed='true'; observer.unobserve(entry.target);
    if(!reducedMotion()&&entry.target.id==='waterfall')entry.target.querySelectorAll('.waterfall rect').forEach((bar,index)=>
      bar.animate([{opacity:.25,transform:'scaleY(.08)'},{opacity:1,transform:'scaleY(1)'}],
        {duration:600,delay:index*45,easing:'cubic-bezier(.2,.7,.2,1)'}));
  }),{threshold:.08});
  document.querySelectorAll('.section').forEach(section=>{
    section.dataset.reveal='true';observer.observe(section);
  });
  const waterfall=document.getElementById('waterfall');if(waterfall)observer.observe(waterfall);
}

export function installPlayback(onShock) {
  const button=document.getElementById('play-scenario'),label=document.getElementById('play-label');
  const status=document.getElementById('motion-status');
  let frame=0,started=0,last=-1,playing=false;
  function stop(finished=false){
    playing=false;cancelAnimationFrame(frame);label.textContent='Reproduzir cenário';
    button.setAttribute('aria-label','Reproduzir simulação do dólar de zero a vinte por cento');
    button.dataset.playing='false'; status.textContent=finished?'USD +20% · simulação concluída.':'Arraste o controle ou explore o gráfico.';
  }
  function tick(now){
    if(!playing)return;
    const value=Math.min(20,Math.floor((now-started)/250));
    if(value!==last){last=value;onShock(value);}
    if(value===20){stop(true);return;}
    frame=requestAnimationFrame(tick);
  }
  function applyPreference(){
    if(reducedMotion()){stop();button.disabled=true;status.textContent='Movimento reduzido ativado no aparelho. Controle manual disponível.';}
    else button.disabled=false;
  }
  button.onclick=()=>{
    if(playing){stop();return;}
    playing=true;last=-1;started=performance.now();label.textContent='Pausar cenário';
    button.dataset.playing='true';button.setAttribute('aria-label','Pausar simulação do dólar');
    status.textContent='Simulação USD 0 → 20% · cinco segundos.';frame=requestAnimationFrame(tick);
  };
  document.getElementById('usd-shock').addEventListener('pointerdown',()=>stop());
  document.getElementById('usd-shock').addEventListener('keydown',()=>stop());
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&playing)stop();});
  motionPreference.addEventListener('change',applyPreference);applyPreference();
}

export function installReadingProgress(){
  const bar=document.getElementById('reading-progress');let queued=false;
  function update(){
    const range=document.documentElement.scrollHeight-innerHeight;
    bar.style.transform=`scaleX(${range>0?Math.max(0,Math.min(1,scrollY/range)):0})`;
    queued=false;
  }
  addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(update);}},{passive:true});
  addEventListener('resize',update);update();
}
