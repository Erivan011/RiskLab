import {commandMatches} from './terminal-state.mjs';
export function installTerminalControls({navigate,replay,reset,onReplayState}){
 const commands=[
  {label:'Compras e orçamento',keywords:'painel dashboard',run:()=>navigate('overview')},
  {label:'Decomposição Shapley',keywords:'volume preco cambio mix',run:()=>navigate('drivers')},
  {label:'Fornecedores e Wilson',keywords:'prazo atraso',run:()=>navigate('suppliers')},
  {label:'Pedidos e pagamentos',keywords:'registros aging',run:()=>navigate('records')},
  {label:'Modelos quantitativos',keywords:'var garch ewma backtest',run:()=>navigate('quant')},
  {label:'Pipeline e qualidade',keywords:'python sql auditoria',run:()=>navigate('pipeline')},
  {label:'Limpar os filtros',keywords:'resetar',run:reset},
  {label:'Reproduzir janeiro a outubro',keywords:'replay animacao',run:()=>{navigate('overview');play();}},
 ];
 const dialog=document.createElement('dialog');dialog.id='command-palette';dialog.setAttribute('aria-label','Busca de ações');dialog.innerHTML='<header><label for="command-query">O que você quer investigar?</label><button id="command-close" aria-label="Fechar busca">Esc ×</button></header><input id="command-query" placeholder="Buscar páginas ou ações…" autocomplete="off"><div id="command-results"></div><p>↑ ↓ navegar · Enter executar · Esc fechar</p>';document.body.append(dialog);
 let matches=[],selected=0,timer=null,month=10;
 const input=dialog.querySelector('input'),results=dialog.querySelector('#command-results'),slider=document.getElementById('replay-month'),label=document.getElementById('replay-label'),button=document.getElementById('replay-play');
 function drawCommands(){matches=commandMatches(commands,input.value);selected=0;renderResults();}
 function renderResults(){results.innerHTML='';if(!matches.length){results.textContent='Nenhuma ação encontrada.';return;}matches.forEach((command,index)=>{const b=document.createElement('button');b.textContent=command.label;b.classList.toggle('selected',index===selected);b.onclick=()=>{dialog.close();command.run();};results.append(b);});}
 function open(){input.value='';dialog.showModal();drawCommands();input.focus();}
 dialog.querySelector('#command-close').onclick=()=>dialog.close();input.oninput=drawCommands;
 input.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();selected=(selected+(e.key==='ArrowDown'?1:-1)+Math.max(1,matches.length))%Math.max(1,matches.length);renderResults();}if(e.key==='Enter'&&matches[selected]){e.preventDefault();dialog.close();matches[selected].run();}};
 document.getElementById('command-open').onclick=open;
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();dialog.open?dialog.close():open();}});
 function stop(){clearInterval(timer);timer=null;button.textContent='▷ Reproduzir';button.setAttribute('aria-pressed','false');onReplayState?.(false);}
 function update(value){month=value;slider.value=value;label.textContent=new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(2026,value-1,1)));replay(value);}
 function play(){if(timer){stop();return;}if(matchMedia('(prefers-reduced-motion: reduce)').matches){label.textContent='Movimento reduzido: use o controle mensal.';return;}if(month>=10)update(1);button.textContent='Ⅱ Pausar';button.setAttribute('aria-pressed','true');onReplayState?.(true);timer=setInterval(()=>{if(month>=10){stop();return;}update(month+1);if(month===10)stop();},1100);}
 slider.oninput=()=>{stop();update(Number(slider.value));};button.onclick=play;
 document.getElementById('replay-all').onclick=()=>{stop();update(10);};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 return {stop,setMonth:value=>{stop();update(value);}};
}
