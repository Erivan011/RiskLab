import dataset from '../../web/purchase-research.json';
import report from '../../web/terminal-quant-report.json';
import {slice,selectRows,suppliers,orders,cutoff} from './data.mjs';
import {Quant} from './Quant';
import React, { useState, useMemo, useEffect } from 'react';
import {
  Activity,
  BarChart2,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Command,
  Compass,
  Cpu,
  Database,
  Download,
  Filter,
  Layers,
  Pause,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Terminal,
  TrendingUp,
  X
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
  ScatterChart,
  Scatter,
  ZAxis,
  Cell,
  ReferenceLine,
  AreaChart,
  Area
} from 'recharts';

// --- HOOK DE INTERPOLAÇÃO NUMÉRICA 60FPS (QUANTITATIVE TICKER MOTION) ---
function useSmoothCounter(targetValue: number, durationMs: number = 460, triggerKey: number = 0): number {
  const [current, setCurrent] = useState<number>(targetValue);

  useEffect(() => {
    const startVal = triggerKey > 0 ? targetValue * 0.88 : current;
    const delta = targetValue - startVal;
    let startTime: number | null = null;
    let frameId: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setCurrent(startVal + delta * easeOut);
      if (progress < 1) {
        frameId = requestAnimationFrame(animate);
      } else {
        setCurrent(targetValue);
      }
    };

    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [targetValue, durationMs, triggerKey]);

  return current;
}

// --- TIPAGENS DO RISKLAB MONOCHROME MOTION + ARQUITETURA INTERNA v4.0 ---
interface SupplierRecord {
  id: string;
  name: string;
  country: string;
  currency: string;
  category: string;
  delivered: number;
  totalOrders: number;
  onTimePct: number;
  wilsonLower: number;
  wilsonUpper: number;
  avgDelayDays: number;
  overduePending: number;
  exposedBrl: number;
  billedBrl: number;
  budgetBrl: number;
  fxDriftBrl: number;
  sparkline: number[];
}

interface PurchaseOrderDetail {
  poId: string;
  supplier: string;
  category: string;
  currency: string;
  orderDate: string;
  ptaxOrderDate: number;
  ptaxInvoiceDate: number;
  budgetBrl: number;
  billedBrl: number;
  shapleyFxBrl: number;
  shapleyVolBrl: number;
  shapleyPriceBrl: number;
  delayDays: number;
  status: 'OVERDUE_PENDING' | 'DELIVERED_LATE' | 'DELIVERED_ON_TIME' | 'PENDING';
  sha256: string;
}

interface MonthlySlice {
  monthIdx: number;
  label: string;
  cumOrders: number;
  cumBudget: number;
  cumBilled: number;
  cumVariance: number;
  fxEffect: number;
  volEffect: number;
  priceEffect: number;
  mixEffect: number;
  onTimePct: number;
  overdueBrl: number;
  ptaxUsd: number;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'basel_backtest' | 'ndf_carry_garch' | 'suppliers_orders' | 'sql_java_parity'
  >('overview');

  // Player Temporal (Jan–Out/2026)
  const [timelineIdx, setTimelineIdx] = useState<number>(10);
  const [isPlayingTimeline, setIsPlayingTimeline] = useState<boolean>(false);
  const [orderLimit,setOrderLimit]=useState(30);
  const [pulseTrigger, setPulseTrigger] = useState<number>(0);

  // Filtros Sóbrios + Cross-Filtering + Slide-Over Drawer + Command Palette (Ctrl+K)
  const [currencyFilter, setCurrencyFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [crossFilteredSupplier, setCrossFilteredSupplier] = useState<string>('ALL');
  const [drawerOrder, setDrawerOrder] = useState<PurchaseOrderDetail | null>(null);
  const [isCommandOpen, setIsCommandOpen] = useState<boolean>(false);
  const [commandQuery, setCommandQuery] = useState<string>('');

  // Simuladores Quantitativos
  const [hedgeRatioPct, setHedgeRatioPct] = useState<number>(0);
  const [hanRiverMigrationPct, setHanRiverMigrationPct] = useState<number>(0);
  const [cdiRatePct, setCdiRatePct] = useState<number>(11.25);
  const [sofrCupomPct, setSofrCupomPct] = useState<number>(4.85);

  // Atalho de teclado Ctrl+K / Cmd+K para o Command Palette
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsCommandOpen(false);
        setDrawerOrder(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Loop do Replay Temporal
  useEffect(() => {
    if (!isPlayingTimeline) return;
    const timer = setInterval(() => {
      setTimelineIdx((prev) => {
        if (prev >= 10) {
          setIsPlayingTimeline(false);
          return 10;
        }
        return prev + 1;
      });
    }, 650);
    return () => clearInterval(timer);
  }, [isPlayingTimeline]);

  const scope=useMemo(()=>({currency:currencyFilter==='ALL'?'':currencyFilter,category:categoryFilter==='ALL'?'':categoryFilter,supplier:crossFilteredSupplier==='ALL'?'':crossFilteredSupplier}),[currencyFilter,categoryFilter,crossFilteredSupplier]);
  useEffect(()=>setOrderLimit(30),[timelineIdx,scope]);
  const currentSlice=useMemo(()=>slice(dataset,timelineIdx,scope),[timelineIdx,scope]);
  const filteredSuppliers=useMemo(()=>suppliers(dataset,timelineIdx,scope),[timelineIdx,scope]);
  const filteredOrders=useMemo(()=>orders(dataset,timelineIdx,scope),[timelineIdx,scope]);
  const SUPPLIERS_DATA=useMemo(()=>suppliers(dataset,timelineIdx,{...scope,supplier:''}),[timelineIdx,scope]);
  const MONTHLY_CHART_SERIES=useMemo(()=>Array.from({length:timelineIdx},(_,i)=>{const x=slice(dataset,i+1,scope);return {mes:x.label,Orcado:x.cumBudget,Faturado:x.cumBilled,DerivaFX:x.fxEffect};}),[timelineIdx,scope]);
  const VOLATILITY_SERIES=report.currencies.USD.volatility.monthly.map(x=>({mes:x.month,EWMA_94:x.ewma*100,GARCH_11:x.garch*100,LongRunOmega:report.currencies.USD.volatility.parameters.longRunAnnual*100}));

  // Cálculo Dinâmico (Shapley + Hedge Carry B3 + Re-routing)
  const computedMetrics = useMemo(() => {
    const fxSaved = Math.round(currentSlice.fxEffect * (hedgeRatioPct / 100) * 0.85);
    const adjFx = currentSlice.fxEffect - fxSaved;
    const adjVariance = adjFx + currentSlice.volEffect + currentSlice.priceEffect + currentSlice.mixEffect;
    const adjBilled = currentSlice.cumBudget + adjVariance;
    const adjVariancePct = currentSlice.cumBudget ? Number(((adjVariance / currentSlice.cumBudget) * 100).toFixed(1)) : 0;
    const adjOnTime = currentSlice.onTimePct;
    const adjOverdue = currentSlice.overdueBrl;

    // Paridade Coberta de Juros B3 (63 dias úteis) — igual ao risk.py e Exposure.java
    const spotPtax = report.currencies.USD.spot;
    const fatorCdi = Math.pow(1 + cdiRatePct / 100, 63 / 252);
    const fatorCupom = 1 + (sofrCupomPct / 100) * (90 / 360);
    const forwardNdfRate = Number((spotPtax * (fatorCdi / fatorCupom)).toFixed(4));
    const forwardPoints = Number((forwardNdfRate - spotPtax).toFixed(4));
    const carryCostBrl = Math.round(130000 * forwardPoints);

    const b0 = currentSlice.cumBudget;
    const b1 = b0 + adjFx;
    const b2 = b1 + currentSlice.volEffect;
    const b3 = b2 + currentSlice.priceEffect;
    const b4 = b3 + currentSlice.mixEffect;

    const waterfallBridge = [
      { etapa: 'Orçamento', BaseInvisivel: 0, Delta: b0, Tipo: 'TOTAL' },
      { etapa: '+ Câmbio', BaseInvisivel: b0, Delta: adjFx, Tipo: 'SAND' },
      { etapa: '+ Volume', BaseInvisivel: b1, Delta: currentSlice.volEffect, Tipo: 'SLATE' },
      { etapa: '+ Preço', BaseInvisivel: b2, Delta: currentSlice.priceEffect, Tipo: 'SAND' },
      { etapa: 'Composição', BaseInvisivel: Math.min(b3,b4), Delta: Math.abs(currentSlice.mixEffect), Tipo: 'MUTED' },
      { etapa: 'Realizado', BaseInvisivel: 0, Delta: b4, Tipo: 'TOTAL' }
    ];

    return {
      adjBilled,
      adjVariance,
      adjVariancePct,
      adjFx,
      fxSaved,
      adjOnTime,
      adjOverdue,
      spotPtax,
      forwardNdfRate,
      forwardPoints,
      carryCostBrl,
      waterfallBridge
    };
  }, [currentSlice, hedgeRatioPct, hanRiverMigrationPct, cdiRatePct, sofrCupomPct]);

  const animBilled = Math.round(useSmoothCounter(computedMetrics.adjBilled, 420, pulseTrigger));
  const animVariance = Math.round(useSmoothCounter(computedMetrics.adjVariance, 420, pulseTrigger));
  const animOnTime = useSmoothCounter(computedMetrics.adjOnTime, 420, pulseTrigger);
  const animOverdue = Math.round(useSmoothCounter(computedMetrics.adjOverdue, 420, pulseTrigger));

  const commandActions = [
    { label: 'Ir para: Backtest cronológico (Kupiec + Christoffersen)', run: () => setActiveTab('basel_backtest') },
    { label: 'Ir para: Otimizador de Hedge NDF (CDI vs. SOFR) & GARCH(1,1)', run: () => setActiveTab('ndf_carry_garch') },
    { label: 'Ir para: Paridade Poliglota (Python vs. Java Exposure.java & SQL Plan)', run: () => setActiveTab('sql_java_parity') },
    { label: 'Investigar fornecedor: Han River', run: () => { setCrossFilteredSupplier('Han River'); setActiveTab('suppliers_orders'); } },
    { label: 'Simular neutralização de 80% do efeito FX', run: () => { setHedgeRatioPct(80); setHanRiverMigrationPct(60); setPulseTrigger((p) => p + 1); } },
    { label: 'Disparar Replay Temporal (Jan/2026 -> Out/2026)', run: () => { setTimelineIdx(1); setIsPlayingTimeline(true); setActiveTab('overview'); } }
  ].filter((a) => a.label.toLowerCase().includes(commandQuery.toLowerCase()));

  return (
    <div className="min-h-screen bg-[#0D0F12] text-[#FFFFFF] font-sans flex flex-col selection:bg-[#5B759B]/30 relative">
      <style>{`
        @keyframes subtleFadeSlide {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes barGrowIn {
          from { transform: scaleX(0); transform-origin: left; }
          to { transform: scaleX(1); transform-origin: left; }
        }
        .animate-panel {
          animation: subtleFadeSlide 0.30s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-wilson-bar {
          animation: barGrowIn 0.65s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>

      {/* Top Monochrome Institutional Bar */}
      <div className="bg-[#12151B] border-b border-[#262B36] px-5 py-2 text-[11px] font-mono flex flex-wrap items-center justify-between gap-4 text-[#8B949E]">
        <div className="flex items-center gap-4">
          <span className="text-[#FFFFFF] font-semibold tracking-wider uppercase">
            RISKLAB ANALYTICS TERMINAL v4.0
          </span>
          <span className="text-[#262B36]">|</span>
          <span>AC AURORA COMPONENTES</span>
          <span className="hidden md:inline text-[#262B36]">|</span>
          <span className="hidden md:inline">
             DADOS & MÉTODO: <strong className="text-[#C4A982]">BASE SINTÉTICA · PYTHON / SQL / REACT</strong>
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsCommandOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[#161A22] hover:bg-[#1E232D] border border-[#262B36] text-[#A0A8B6] text-[11px] font-mono cursor-pointer"
          >
            <Command className="w-3 h-3 text-[#C4A982]" />
            <span>Comando Rápido</span>
            <kbd className="px-1 py-0.2 bg-[#0D0F12] border border-[#262B36] rounded text-[10px]">Ctrl+K</kbd>
          </button>

          <button
            onClick={() => {
              if (isPlayingTimeline) setIsPlayingTimeline(false);
              else {
                setTimelineIdx(1);
                setIsPlayingTimeline(true);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-[6px] bg-[#1E232D] hover:bg-[#262B36] border border-[#343B4A] text-[#FFFFFF] text-[11px] font-mono transition cursor-pointer"
          >
            {isPlayingTimeline ? <Pause className="w-3 h-3 text-[#C4A982]" /> : <Play className="w-3 h-3 text-[#C4A982]" />}
            {isPlayingTimeline ? `Replay (${currentSlice.label})` : '▶ Replay Jan–Out'}
          </button>
        </div>
      </div>

      {/* Main Frame */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Sidebar Fixa no Estilo Sóbrio (#12151B / #161A22) */}
        <aside className="w-full lg:w-64 bg-[#12151B] border-b lg:border-b-0 lg:border-r border-[#262B36] p-4 flex flex-col justify-between shrink-0">
          <div className="space-y-6">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#8B949E] px-2 mb-2">
                MÓDULOS DE ENGENHARIA &amp; RISCO
              </div>
              <div className="space-y-1">
                {[
                  { id: 'overview', label: '1. Compras & Cascata Shapley', sub: 'Visão geral + Replay temporal' },
                  { id: 'basel_backtest', label: '2. Backtest cronológico (Kupiec)', sub: 'Cornish-Fisher + t-Student ES' },
                  { id: 'ndf_carry_garch', label: '3. Hedge NDF (CDI) & GARCH(1,1)', sub: 'Juros manuais + Volatilidade' },
                  { id: 'suppliers_orders', label: '4. Fornecedores & Raio-X PO', sub: 'Cross-filter + Gaveta lateral' },
                  { id: 'sql_java_parity', label: '5. Pipeline & Rastreabilidade', sub: 'Python · SQLite · React · Java' }
                ].map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as any);
                        setPulseTrigger((p) => p + 1);
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-[6px] transition cursor-pointer border ${
                        active
                          ? 'bg-[#1E232D] border-[#5B759B] text-[#FFFFFF]'
                          : 'bg-transparent border-transparent text-[#8B949E] hover:text-[#FFFFFF] hover:bg-[#161A22]'
                      }`}
                    >
                      <div className="text-xs font-medium">{tab.label}</div>
                      <div className="text-[10px] font-mono text-[#8B949E] mt-0.5">{tab.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Simuladores Paramétricos */}
            <div className="pt-4 border-t border-[#262B36] space-y-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[#8B949E] px-1">
                PARÂMETROS WHAT-IF
              </div>

              <div className="p-3 rounded-[6px] bg-[#161A22] border border-[#262B36] space-y-1.5">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className="text-[#8B949E]">Neutralização FX hipotética:</span>
                  <span className="text-[#C4A982] font-bold">{hedgeRatioPct}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={10}
                  value={hedgeRatioPct}
                  onChange={(e) => setHedgeRatioPct(Number(e.target.value))}
                  className="w-full accent-[#5B759B] cursor-pointer"
                />
                <div className="text-[10px] text-[#8B949E]">
                  Efeito FX removido: R$ {computedMetrics.fxSaved.toLocaleString('pt-BR')}
                </div>
              </div>

              <p className="text-[10px] text-[#8B949E]">Cenário: remove proporcionalmente o efeito FX atribuído (85% de efetividade assumida), sem precificar hedge ou alterar a execução observada.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-[#262B36] text-[11px] font-mono text-[#8B949E] space-y-1">
            <div className="text-[#FFFFFF] font-sans font-semibold uppercase tracking-wider">
              PORTFÓLIO / ERIVAN SANTOS
            </div>
            <div>Python · SQL · Java · Node.js</div>
          </div>
        </aside>

        {/* Área Analítica Principal */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <header className="bg-[#12151B] border-b border-[#262B36] px-6 py-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.12em] text-[#8B949E]">
                  WORKSPACE / {activeTab.toUpperCase()} · CORTE {currentSlice.label.toUpperCase()}
                </div>
                <h1 className="text-xl font-semibold text-[#FFFFFF] tracking-tight mt-0.5">
                  Compras, causas e risco · Analytics Terminal
                </h1>
              </div>

              <div className="flex items-center gap-2">
                {crossFilteredSupplier !== 'ALL' && (
                  <button
                    onClick={() => setCrossFilteredSupplier('ALL')}
                    className="px-2.5 py-1.5 rounded-[6px] text-xs font-mono bg-[#1E232D] text-[#C4A982] border border-[#C4A982]/40 cursor-pointer"
                  >
                    Filtro Ativo: {crossFilteredSupplier} ✕
                  </button>
                )}
                <button
                  onClick={() => {
                    setHedgeRatioPct(0);
                    setHanRiverMigrationPct(0);
                    setCurrencyFilter('ALL');
                    setCategoryFilter('ALL');
                    setCrossFilteredSupplier('ALL');
                    setTimelineIdx(10);
                    setIsPlayingTimeline(false);
                    setPulseTrigger((p) => p + 1);
                  }}
                  className="px-3 py-1.5 rounded-[6px] text-xs font-mono bg-[#161A22] hover:bg-[#1E232D] text-[#A0A8B6] border border-[#262B36] transition cursor-pointer"
                >
                  Limpar filtros
                </button>
              </div>
            </div>
          </header>

          <div className="bg-[#12151B] px-6 py-3 flex flex-wrap gap-4 items-center text-xs border-b border-[#262B36]">
            <label>Moeda <select aria-label="Moeda" className="bg-[#161A22] border border-[#343B4A] p-2 rounded" value={currencyFilter} onChange={e=>setCurrencyFilter(e.target.value)}><option value="ALL">Todas</option>{['USD','EUR','BRL'].map(x=><option key={x}>{x}</option>)}</select></label>
            <label>Categoria <select aria-label="Categoria" className="bg-[#161A22] border border-[#343B4A] p-2 rounded" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="ALL">Todas</option>{[...new Set(dataset.rows.map(r=>r.category))].map(x=><option key={x}>{x}</option>)}</select></label>
            <label className="flex gap-2 items-center">Corte mensal <input aria-label="Corte mensal" type="range" min="1" max="10" value={timelineIdx} onChange={e=>{setIsPlayingTimeline(false);setTimelineIdx(Number(e.target.value));}} className="accent-[#C4A982]"/>{currentSlice.label}</label>
            <a className="text-[#C4A982] underline" href="/purchase-research.json" download>Base JSON ↓</a>
          </div>
          {/* Main Body */}
          <main className="p-6 space-y-6 flex-1 animate-panel" key={`${activeTab}-${pulseTrigger}`}>
            {/* 4 KPI CARDS MONOCROMÁTICOS COM INTERPOLAÇÃO 60FPS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#161A22] border border-[#262B36] rounded-[8px] p-4">
                <div className="text-xs text-[#8B949E] mb-1">Compras faturadas</div>
                <div className="text-2xl font-bold font-mono text-[#FFFFFF]">
                  R$ {animBilled.toLocaleString('pt-BR')}
                </div>
                <div className="text-[11px] font-mono text-[#8B949E] mt-1.5">
                  Orçamento: R$ {currentSlice.cumBudget.toLocaleString('pt-BR')}
                </div>
              </div>

              <div className="bg-[#161A22] border border-[#262B36] rounded-[8px] p-4">
                <div className="text-xs text-[#8B949E] mb-1">Desvio contra orçamento</div>
                <div className="text-2xl font-bold font-mono text-[#C4A982]">
                  R$ {animVariance.toLocaleString('pt-BR')}{' '}
                  <span className="text-sm font-normal text-[#A0A8B6]">({computedMetrics.adjVariancePct}%)</span>
                </div>
                <div className="text-[11px] font-mono text-[#8B949E] mt-1.5">
                  Shapley Câmbio: R$ {computedMetrics.adjFx.toLocaleString('pt-BR')}
                </div>
              </div>

              <div className="bg-[#161A22] border border-[#262B36] rounded-[8px] p-4">
                <div className="text-xs text-[#8B949E] mb-1">Entrega pontual (Wilson 95%)</div>
                <div className="text-2xl font-bold font-mono text-[#FFFFFF]">
                  {animOnTime.toFixed(1)}%
                </div>
                <div className="text-[11px] font-mono text-[#8B949E] mt-1.5">
                  {currentSlice.cumOrders} pedidos no recorte · entregas observadas no corte
                </div>
              </div>

              <div className="bg-[#161A22] border border-[#262B36] rounded-[8px] p-4">
                <div className="text-xs text-[#8B949E] mb-1">Pagamentos vencidos em aberto</div>
                <div className="text-2xl font-bold font-mono text-[#C4A982]">
                  R$ {animOverdue.toLocaleString('pt-BR')}
                </div>
                <div className="text-[11px] font-mono text-[#8B949E] mt-1.5">
                  Saldo sem pagamento observado até o corte
                </div>
              </div>
            </div>

            {/* ABA 1: OVERVIEW (PONTE DE CASCATA SHAPLEY + EVOLUÇÃO MENSAL) */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#161A22] border border-[#262B36] rounded-[8px] p-5">
                  <h2 className="text-sm font-semibold text-[#FFFFFF] mb-1">
                    Ponte de Decomposição Shapley (24 permutações · reconciliado)
                  </h2>
                  <p className="text-xs text-[#8B949E] mb-4">
                    24 permutações calculadas no recorte · volume × composição × preço × câmbio
                  </p>
                  <div className="relative h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={computedMetrics.waterfallBridge} margin={{ top: 10, right: 15, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#262B36" vertical={false} />
                        <XAxis dataKey="etapa" stroke="#8B949E" fontSize={11} tickLine={false} />
                        <YAxis stroke="#8B949E" fontSize={11} tickLine={false} domain={[0, 'auto']} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#12151B', borderColor: '#262B36', fontSize: '12px', color: '#FFFFFF', fontFamily: 'monospace' }}
                          formatter={(val: any, name: string) => {
                            if (name === 'BaseInvisivel') return [null, null];
                            return [`R$ ${Number(val).toLocaleString('pt-BR')}`, 'Impacto / Nível'];
                          }}
                        />
                        <Bar dataKey="BaseInvisivel" stackId="wf" fill="transparent" isAnimationActive={false} />
                        <Bar dataKey="Delta" stackId="wf" radius={[3, 3, 0, 0]} animationDuration={600}>
                          {computedMetrics.waterfallBridge.map((entry, idx) => (
                            <Cell
                              key={idx}
                              fill={
                                entry.Tipo === 'TOTAL'
                                  ? '#5B759B'
                                  : entry.Tipo === 'SAND'
                                  ? '#C4A982'
                                  : entry.Tipo === 'SLATE'
                                  ? '#7A90B0'
                                  : '#4A5568'
                              }
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#161A22] border border-[#262B36] rounded-[8px] p-5">
                  <h2 className="text-sm font-semibold text-[#FFFFFF] mb-1">
                    Evolução Mensal (Orçamento × Realizado &amp; Deriva FX)
                  </h2>
                  <p className="text-xs text-[#8B949E] mb-4">
                    Clique em "▶ Replay Jan–Out" no topo para assistir à progressão acumulada mês a mês
                  </p>
                  <div className="relative h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={MONTHLY_CHART_SERIES.slice(0, timelineIdx)} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#262B36" vertical={false} />
                        <XAxis dataKey="mes" stroke="#8B949E" fontSize={11} tickLine={false} />
                        <YAxis stroke="#8B949E" fontSize={11} tickLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#12151B', borderColor: '#262B36', fontSize: '12px', color: '#FFFFFF', fontFamily: 'monospace' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px', color: '#8B949E' }} />
                        <Bar dataKey="Orcado" name="Orçado (R$)" fill="#2D3545" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="Faturado" name="Faturado (R$)" fill="#5B759B" radius={[3, 3, 0, 0]} />
                        <Line type="monotone" dataKey="DerivaFX" name="Deriva FX (R$)" stroke="#C4A982" strokeWidth={2.2} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 2: BACKTEST FORMAL DE BASILEIA III (KUPIEC POF + CHRISTOFFERSEN + CORNISH-FISHER / T-STUDENT) */}
            {activeTab === 'basel_backtest' && <Quant report={report} currency={currencyFilter} mode="backtest"/>}

            {/* ABA 3: OTIMIZADOR DE HEDGE NDF (CDI vs. CUPOM CAMBIAL B3) & VOLATILIDADE GARCH(1,1) */}
            {activeTab === 'ndf_carry_garch' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#161A22] border border-[#262B36] rounded-[8px] p-5 space-y-5"><h2 className="text-sm font-semibold">Taxa a termo · premissas manuais</h2><p className="text-xs text-[#8B949E]">Ilustração de paridade de juros, não cotação executável de NDF. Spot USD de referência {report.asOf}. Prazo doméstico 63 dias úteis e externo 90 dias corridos.</p><label className="block text-xs">Taxa doméstica anual: {cdiRatePct.toFixed(2)}%<input aria-label="Taxa doméstica anual" className="w-full accent-[#C4A982]" type="range" min="0" max="25" step="0.25" value={cdiRatePct} onChange={e=>setCdiRatePct(Number(e.target.value))}/></label><label className="block text-xs">Taxa externa anual: {sofrCupomPct.toFixed(2)}%<input aria-label="Taxa externa anual" className="w-full accent-[#5B759B]" type="range" min="0" max="15" step="0.01" value={sofrCupomPct} onChange={e=>setSofrCupomPct(Number(e.target.value))}/></label><div className="grid grid-cols-2 gap-4 font-mono"><div><small>Spot de referência</small><p>{computedMetrics.spotPtax.toFixed(4)}</p></div><div><small>Termo ilustrativo</small><p className="text-[#C4A982] text-xl">{computedMetrics.forwardNdfRate.toFixed(4)}</p></div></div><p className="text-xs text-[#8B949E]">F = spot × (1 + doméstica)^(63/252) ÷ (1 + externa × 90/360). Taxa externa não equivale automaticamente ao cupom cambial brasileiro.</p></div>
                <Quant report={report} currency={currencyFilter} mode="volatility"/>
              </div>
            )}

            {/* ABA 4: FORNECEDORES (CROSS-FILTER) & PEDIDOS (CLIQUE PARA ABRIR GAVETA SLIDE-OVER) */}
            {activeTab === 'suppliers_orders' && (
              <div className="space-y-6">
                <div className="bg-[#161A22] border border-[#262B36] rounded-[8px] p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-[#FFFFFF]">
                        Desempenho dos Fornecedores (Clique em um Fornecedor para Cross-Filtering dos Pedidos)
                      </h2>
                      <p className="text-xs text-[#8B949E]">
                        Wilson 95% entre entregues · tendência acumulada dos últimos 6 cortes · pendentes excluídos da pontualidade
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="border-b border-[#262B36] text-[#8B949E] text-[11px]">
                          <th className="py-2.5 px-2.5 font-sans">Fornecedor</th>
                          <th className="py-2.5 px-2.5 text-center">Entregues</th>
                          <th className="py-2.5 px-2.5">Pontualidade</th>
                          <th className="py-2.5 px-2.5 w-60">Wilson 95%</th>
                          <th className="py-2.5 px-2.5 text-center">Tendência 6m</th>
                          <th className="py-2.5 px-2.5 text-right">Valor Exposto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#262B36]/60">
                        {filteredSuppliers.map((s) => {
                          const isSelected = crossFilteredSupplier === s.name;
                          return (
                            <tr
                              key={s.id}
                              role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setCrossFilteredSupplier(isSelected?'ALL':s.name);}} onClick={() => setCrossFilteredSupplier(isSelected ? 'ALL' : s.name)}
                              className={`cursor-pointer transition ${
                                isSelected ? 'bg-[#1E232D]' : 'hover:bg-[#1E232D]/50'
                              }`}
                            >
                              <td className="py-2.5 px-2.5 font-sans">
                                <span className="font-semibold text-[#FFFFFF]">{s.name}</span>{' '}
                                <span className="text-[11px] text-[#8B949E]">({s.currency})</span>
                              </td>
                              <td className="py-2.5 px-2.5 text-center text-[#A0A8B6]">{s.delivered}/{s.totalOrders}</td>
                              <td className="py-2.5 px-2.5 font-bold text-[#FFFFFF]">{s.delivered?s.onTimePct.toFixed(1)+'%':'Sem desfecho'}</td>
                              <td className="py-2.5 px-2.5">
                                <div className="w-full h-2 bg-[#0D0F12] border border-[#262B36] rounded-[3px] relative overflow-hidden">
                                  <div
                                    className="absolute top-0 bottom-0 bg-[#5B759B]/45 animate-wilson-bar"
                                    style={{ left: `${s.wilsonLower}%`, width: `${s.wilsonUpper - s.wilsonLower}%` }}
                                  />
                                  <div className="absolute top-0 bottom-0 w-1 bg-[#C4A982]" style={{ left: `${s.onTimePct}%` }} />
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5 text-center">
                                <svg width="64" height="18" className="inline-block">
                                  <polyline
                                    fill="none"
                                    stroke={s.onTimePct < 40 ? '#C4A982' : '#5B759B'}
                                    strokeWidth="1.8"
                                    points={s.sparkline.map((v, idx) => `${idx * 11},${16 - (v / 100) * 14}`).join(' ')}
                                  />
                                </svg>
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-bold text-[#C4A982]">
                                R$ {s.exposedBrl.toLocaleString('pt-BR')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Tabela de Pedidos com Gaveta Slide-Over ao Clicar */}
                <div className="bg-[#161A22] border border-[#262B36] rounded-[8px] p-5">
                  <h3 className="text-sm font-semibold text-[#FFFFFF] mb-1">
                    Pedidos e Pagamentos (Clique em qualquer linha para abrir a Gaveta Lateral de Raio-X do Pedido)
                  </h3>
                  <p className="text-xs text-[#8B949E] mb-3">
                    Inspecione o câmbio sintético de base e de faturamento e a decomposição Shapley individual
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="border-b border-[#262B36] text-[#8B949E]">
                          <th className="py-2.5 px-2.5">PO ID</th>
                          <th className="py-2.5 px-2.5">Fornecedor</th>
                          <th className="py-2.5 px-2.5">Data Pedido</th>
                          <th className="py-2.5 px-2.5 text-right">Orçado</th>
                          <th className="py-2.5 px-2.5 text-right">Faturado</th>
                          <th className="py-2.5 px-2.5 text-right">Shapley FX</th>
                          <th className="py-2.5 px-2.5">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#262B36]/60">
                        {filteredOrders.slice(0,orderLimit).map((po) => (
                          <tr
                            key={po.poId}
                            role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')setDrawerOrder(po);}} onClick={() => setDrawerOrder(po)}
                            className="hover:bg-[#1E232D] cursor-pointer transition"
                          >
                            <td className="py-2.5 px-2.5 font-bold text-[#FFFFFF]">{po.poId}</td>
                            <td className="py-2.5 px-2.5 font-sans text-[#A0A8B6]">{po.supplier}</td>
                            <td className="py-2.5 px-2.5 text-[#8B949E]">{po.orderDate}</td>
                            <td className="py-2.5 px-2.5 text-right text-[#8B949E]">R$ {po.budgetBrl.toLocaleString('pt-BR')}</td>
                            <td className="py-2.5 px-2.5 text-right text-[#FFFFFF] font-bold">R$ {po.billedBrl.toLocaleString('pt-BR')}</td>
                            <td className="py-2.5 px-2.5 text-right text-[#C4A982]">+R$ {po.shapleyFxBrl.toLocaleString('pt-BR')}</td>
                            <td className="py-2.5 px-2.5 text-[#5B759B] underline">Abrir Raio-X →</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  <div className="flex gap-4 items-center text-xs mt-4 text-[#8B949E]">{Math.min(orderLimit,filteredOrders.length)} de {filteredOrders.length} pedidos{orderLimit<filteredOrders.length&&<button className="border border-[#343B4A] px-3 py-2 rounded text-[#C4A982]" onClick={()=>setOrderLimit(n=>n+30)}>Carregar mais 30</button>}</div>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 5: ARQUITETURA POLIGLOTA (SQLITE EXPLAIN QUERY PLAN & JAVA PARITY) */}
            {activeTab === 'sql_java_parity' && <section className="grid lg:grid-cols-2 gap-6 animate-panel"><div className="bg-[#161A22] p-5 rounded border border-[#262B36] space-y-3"><h2>Pipeline Python → SQLite → React</h2><p className="text-xs text-[#8B949E]">Pedidos inteiramente sintéticos, reproduzíveis por semente. Importação idempotente com validação e identificação de alterações.</p><pre className="text-xs whitespace-pre-wrap font-mono text-[#C4A982]">{JSON.stringify(dataset.run,null,2)}</pre></div><div className="bg-[#161A22] p-5 rounded border border-[#262B36] space-y-4"><h2>Rastreabilidade e código aberto</h2><p className="text-xs text-[#8B949E]">A cascata executa as 24 permutações dos quatro fatores no recorte selecionado. O arredondamento monetário é incluído em composição. Resíduo atual: R$ {currentSlice.residual.toFixed(8)}.</p><p className="text-xs text-[#8B949E]">O relatório quantitativo é gerado em Python com janela anterior a cada previsão. Java possui uma implementação de referência; a interface não afirma execução ou paridade com um servidor Java.</p><a className="text-[#C4A982] underline" href="https://github.com/Erivan011/RiskLab" target="_blank" rel="noreferrer">Abrir código e documentação ↗</a><a className="block underline text-xs" href="/data-explorer.html">Explorador estatístico ↗</a><a className="block underline text-xs" href="/editorial.html">Mesa de câmbio e caixa ↗</a></div></section>}
            <p className="text-[11px] text-[#8B949E]">{dataset.disclosure} Corte {dataset.asOf}. Relatório BCB: {report.asOf}. Resultados materializados, sem promessa de tempo real. {currentSlice.cumOrders===0?'Nenhum pedido corresponde aos filtros.':''}</p>
          </main>
        </div>
      </div>

      {/* GAVETA LATERAL (SLIDE-OVER DRAWER) DE RAIO-X DO PEDIDO */}
      {drawerOrder && (
        <div role="dialog" aria-modal="true" aria-label="Raio-X do pedido" className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 flex justify-end">
          <div className="w-full max-w-md bg-[#12151B] border-l border-[#262B36] h-full p-6 flex flex-col justify-between animate-panel overflow-y-auto">
            <div className="space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-[#262B36]">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#C4A982]">
                    RAIO-X DE AUDITORIA DO PEDIDO
                  </span>
                  <h3 className="text-lg font-bold font-mono text-[#FFFFFF] mt-0.5">{drawerOrder.poId}</h3>
                </div>
                <button
                  onClick={() => setDrawerOrder(null)}
                  className="p-1.5 rounded bg-[#161A22] hover:bg-[#1E232D] text-[#8B949E] hover:text-[#FFFFFF] cursor-pointer"
                 aria-label="Fechar detalhamento">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-3.5 rounded-[6px] bg-[#161A22] border border-[#262B36] space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#8B949E]">Fornecedor:</span>
                    <span className="text-[#FFFFFF] font-bold">{drawerOrder.supplier} ({drawerOrder.currency})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B949E]">Data do Pedido:</span>
                    <span className="text-[#FFFFFF]">{drawerOrder.orderDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B949E]">Câmbio simulado base vs. faturado:</span>
                    <span className="text-[#C4A982]">
                      R$ {drawerOrder.ptaxOrderDate.toFixed(4)} → R$ {drawerOrder.ptaxInvoiceDate.toFixed(4)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B949E]">Atraso Físico:</span>
                    <span className="text-[#FFFFFF]">{drawerOrder.delayDays} dias ({drawerOrder.status})</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-[6px] bg-[#161A22] border border-[#262B36] space-y-2">
                  <div className="text-[11px] text-[#8B949E] uppercase">Decomposição Shapley Individual da Nota</div>
                  <div className="flex justify-between">
                    <span className="text-[#8B949E]">Orçamento Base:</span>
                    <span className="text-[#FFFFFF]">R$ {drawerOrder.budgetBrl.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B949E]">+ Efeito Câmbio (FX):</span>
                    <span className="text-[#C4A982]">+R$ {drawerOrder.shapleyFxBrl.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B949E]">+ Efeito Preço:</span>
                    <span className="text-[#A0A8B6]">+R$ {drawerOrder.shapleyPriceBrl.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#8B949E]">+ Efeito Volume:</span>
                    <span className="text-[#5B759B]">+R$ {drawerOrder.shapleyVolBrl.toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="pt-2 border-t border-[#262B36] flex justify-between font-bold">
                    <span className="text-[#FFFFFF]">Total Faturado:</span>
                    <span className="text-[#FFFFFF]">R$ {drawerOrder.billedBrl.toLocaleString('pt-BR')}</span>
                  </div>
                </div>

                <div className="p-3 rounded-[6px] bg-[#0D0F12] border border-[#262B36] text-[11px] text-[#8B949E]">
                  SHA-256 da base: <span className="text-[#FFFFFF] break-all">{drawerOrder.sha256}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setDrawerOrder(null)}
              className="w-full py-2 rounded-[6px] bg-[#5B759B] hover:bg-[#6B85AB] text-[#FFFFFF] text-xs font-mono font-semibold cursor-pointer"
            >
              Fechar Raio-X
            </button>
          </div>
        </div>
      )}

      {/* COMMAND PALETTE MODAL (CTRL+K) */}
      {isCommandOpen && (
        <div role="dialog" aria-modal="true" aria-label="Comando Rápido" className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-start justify-center pt-20 px-4">
          <div className="w-full max-w-lg bg-[#12151B] border border-[#343B4A] rounded-[8px] shadow-2xl overflow-hidden animate-panel">
            <div className="p-3 border-b border-[#262B36] flex items-center gap-2">
              <Search className="w-4 h-4 text-[#C4A982]" />
              <input
                type="text"
                autoFocus
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                placeholder="Digite um comando, fornecedor ou módulo (ex: Kupiec, GARCH, Han River)..."
                className="w-full bg-transparent text-xs font-mono text-[#FFFFFF] focus:outline-none"
              />
              <button
                onClick={() => setIsCommandOpen(false)}
                className="text-xs font-mono text-[#8B949E] hover:text-[#FFFFFF] px-1.5 cursor-pointer"
              >
                ESC
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-[#262B36]/50">
              {commandActions.map((act, i) => (
                <button
                  key={i}
                  onClick={() => {
                    act.run();
                    setIsCommandOpen(false);
                    setCommandQuery('');
                  }}
                  className="w-full text-left px-4 py-3 text-xs font-mono text-[#A0A8B6] hover:bg-[#1E232D] hover:text-[#FFFFFF] flex items-center justify-between cursor-pointer"
                >
                  <span>{act.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#C4A982]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}