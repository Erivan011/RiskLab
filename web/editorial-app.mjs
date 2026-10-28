import {animateMoney,animateProfile,installChartProbe,startEditorialMotion,installPlayback,installReadingProgress} from './editorial-motion.mjs';
import {editorialState,formatBrl,answerMarkup,profileSvg,waterfallSvg,driversMarkup,hedgeMarkup,heatmapMarkup,chartDescription} from './editorial-model.mjs';


const INPUT=JSON.parse(document.getElementById("editorial-input").textContent);

function syncThemeControl(){
 const dark = document.documentElement.dataset.theme !== 'light';
 document.getElementById('theme-label').textContent = dark ? 'Claro' : 'Escuro';
 document.getElementById('theme-toggle').setAttribute('aria-label',dark ? 'Ativar tema claro' : 'Ativar tema escuro');
 document.querySelector('meta[name="theme-color"]').content = dark ? '#101210' : '#f6f3ec';
}
document.getElementById('theme-toggle').onclick=()=>{
 const theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
 document.documentElement.dataset.theme = theme;
 try { localStorage.setItem('risklab.editorial.theme',theme); } catch {}
 syncThemeControl();
};
syncThemeControl();
let activeShock=.1;
const ui=id=>document.getElementById(id);
function render(intro=false){
 const previousPath=ui("profile").querySelector("path:last-of-type")?.getAttribute("d");
 const state=editorialState(INPUT,activeShock);
 ui('question-shock').textContent=Math.round(activeShock*100);
 ui('shock-output').textContent='+'+Math.round(activeShock*100)+'%';
 animateMoney(ui('funding'),state.fundingCents,formatBrl);
 ui('answer-text').innerHTML=answerMarkup(state);
 ui('profile').innerHTML=profileSvg(state,INPUT);
 ui('profile').setAttribute('aria-label',chartDescription(state));
 ui('delta').innerHTML='vs. base <b>+'+formatBrl((state.fundingCents-state.baseFundingCents)/100)+'</b> de aporte';
 ui('waterfall').innerHTML=waterfallSvg(state,INPUT);
 animateMoney(ui('cost-delta'),state.analysis.shockImpactCents,formatBrl,'+');
 ui('drivers').innerHTML=driversMarkup(state);
 ui('hedge-body').innerHTML=hedgeMarkup(state);
 ui('maturity-heatmap').innerHTML=heatmapMarkup(state,INPUT);
 animateProfile(ui('profile'),previousPath,intro);
 installChartProbe(ui('profile'),state,INPUT,formatBrl);
}
ui('usd-shock').addEventListener('input',event=>{activeShock=Number(event.target.value)/100;render()});
ui('download-report').onclick=()=>{const state=editorialState(INPUT,activeShock);const report={model:'USD-only contractual sensitivity',disclosure:'Carteira fictícia; sem previsão ou execução.',input:INPUT,shock:{USD:activeShock,EUR:0,GBP:0},fundingCents:state.fundingCents,baseFundingCents:state.baseFundingCents,dailyLedger:state.analysis.cash,hedgeHypotheses:state.hedges.map(h=>({coverage:h.coverage,totalCents:h.analysis.totalCents,shockImpactCents:h.analysis.shockImpactCents,fundingCents:h.fundingCents}))};const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='risklab-estudo-editorial.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);ui('report-status').textContent='Memória exportada com premissas e movimentos diários.';};
render(true);document.documentElement.classList.add('js-ready');
startEditorialMotion();
installPlayback(value=>{activeShock=value/100;ui('usd-shock').value=value;render();});
installReadingProgress();
