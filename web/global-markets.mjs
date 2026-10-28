import {MARKET_GROUPS,MARKET_WIDGET_SCRIPT,marketWidgetConfig} from './global-market-config.mjs';

export function installGlobalMarkets() {
  const section=document.getElementById('mercados');
  if(!section)return;
  const host=document.getElementById('market-widget-host');
  const status=document.getElementById('market-provider-status');
  const description=document.getElementById('market-group-description');
  const availability=document.getElementById('market-availability');
  const retry=document.getElementById('market-retry');
  let group='indices',started=false,generation=0,timer,observer;
  function updateCopy(){
    description.textContent=MARKET_GROUPS[group].description;
    availability.textContent=MARKET_GROUPS[group].availability;
    section.querySelectorAll('[data-market-group]').forEach(button=>{
      const selected=button.dataset.marketGroup===group;
      button.setAttribute('aria-pressed',String(selected));button.classList.toggle('selected',selected);
    });
  }
  function mount(){
    started=true;const current=++generation;
    clearTimeout(timer);observer?.disconnect();
    host.setAttribute('aria-busy','true');
    status.textContent='Carregando painel externo do TradingView…';retry.hidden=true;
    const container=document.createElement('div');container.className='tradingview-widget-container';
    const widget=document.createElement('div');widget.className='tradingview-widget-container__widget';
    container.append(widget);host.replaceChildren(container);
    function failed(){
      if(current!==generation)return;
      clearTimeout(timer);host.removeAttribute('aria-busy');retry.hidden=false;
      if(!host.querySelector('.market-load-error')){
        const notice=document.createElement('div');notice.className='market-load-error';notice.textContent='Cotações indisponíveis no momento. Tente novamente ou consulte a fonte.';host.append(notice);
      }
      status.textContent='Não foi possível confirmar o carregamento. Verifique a conexão ou abra a fonte no link abaixo.';
    }
    function loaded(){
      if(current!==generation)return;
      clearTimeout(timer);host.removeAttribute('aria-busy');retry.hidden=true;host.querySelector('.market-load-error')?.remove();
      status.textContent='Painel externo carregado. Confira o horário e a disponibilidade de cada ativo no provedor.';
    }
    observer=new MutationObserver(()=>{
      const iframe=container.querySelector('iframe');
      if(!iframe)return;
      iframe.title='Cotações '+MARKET_GROUPS[group].label+' — TradingView';
      iframe.addEventListener('load',loaded,{once:true});observer.disconnect();
    });
    observer.observe(container,{childList:true,subtree:true});
    const script=document.createElement('script');script.type='text/javascript';
    script.src=MARKET_WIDGET_SCRIPT;script.async=true;
    script.textContent=JSON.stringify(marketWidgetConfig(group,document.documentElement.dataset.theme==='light'?'light':'dark'));
    script.onerror=failed;container.append(script);
    timer=setTimeout(failed,15000);
  }
  updateCopy();
  section.querySelectorAll('[data-market-group]').forEach(button=>button.addEventListener('click',()=>{
    const next=button.dataset.marketGroup;if(next===group&&started)return;
    group=next;updateCopy();mount();
  }));
  retry.onclick=mount;
  new MutationObserver(()=>{if(started)mount();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  if('IntersectionObserver' in window){
    const intersection=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){intersection.disconnect();if(!started)mount();}
    },{rootMargin:'300px'});intersection.observe(section);
  }else mount();
}
