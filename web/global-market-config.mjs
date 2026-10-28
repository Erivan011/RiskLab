// Public display configuration only. No portfolio values or credentials are sent.
export const MARKET_WIDGET_SCRIPT = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js';
export const MARKET_GROUPS = {
  indices: {
    label: 'Índices',
    description: 'Brasil, EUA, Europa e Ásia. Instrumentos CFD estão identificados e não são a cotação oficial do índice à vista.',
    availability: 'Índices podem ter atraso ou restrições. Consulte a identificação do ativo no provedor.',
    symbols: [
      {s:'BMFBOVESPA:IBOV',d:'Ibovespa · Brasil'},
      {s:'FOREXCOM:SPXUSD',d:'S&P 500 · EUA (CFD)'},
      {s:'FOREXCOM:NSXUSD',d:'US 100 · EUA (CFD)'},
      {s:'INDEX:DEU40',d:'DAX · Alemanha'},
      {s:'INDEX:CAC40',d:'CAC 40 · França'},
      {s:'FOREXCOM:UKXGBP',d:'UK 100 · Reino Unido (CFD)'},
      {s:'INDEX:NKY',d:'Nikkei 225 · Japão'},
      {s:'SSE:000001',d:'Shanghai Composite · China'},
      {s:'INDEX:HSI',d:'Hang Seng · Hong Kong'},
    ],
  },
  brazil: {
    label:'Ações BR',
    description:'Empresas negociadas na B3. Valores na moeda de negociação, sem conversão pelo RiskLab.',
    availability:'Dados de bolsa podem ter atraso. Mercado fechado mantém a última cotação disponível.',
    symbols:[{s:'BMFBOVESPA:PETR4',d:'Petrobras PN'},{s:'BMFBOVESPA:VALE3',d:'Vale ON'},{s:'BMFBOVESPA:ITUB4',d:'Itaú Unibanco PN'},{s:'BMFBOVESPA:BBDC4',d:'Bradesco PN'},{s:'BMFBOVESPA:WEGE3',d:'WEG ON'}],
  },
  stocks: {
    label:'Ações globais',
    description:'Seleção de empresas internacionais listadas nos EUA. Uma listagem nos EUA não representa a bolsa de origem de cada empresa.',
    availability:'Ações podem ter atraso e restrições de exibição. Horários, pregão estendido e fonte são do provedor.',
    symbols:[{s:'NASDAQ:AAPL',d:'Apple · EUA'},{s:'NASDAQ:MSFT',d:'Microsoft · EUA'},{s:'NASDAQ:NVDA',d:'NVIDIA · EUA'},{s:'NASDAQ:AMZN',d:'Amazon · EUA'},{s:'NYSE:TSM',d:'TSMC · Taiwan (ADR)'},{s:'NYSE:BABA',d:'Alibaba · China (ADR)'}],
  },
  forex: {
    label:'Moedas',
    description:'Pares cambiais com real, euro, libra, iene, yuan e franco. O preço é expresso na segunda moeda do par.',
    availability:'Câmbio em tempo real conforme a fonte e a sessão de negociação. Não é a taxa contratável de um banco.',
    symbols:[{s:'FX_IDC:USDBRL',d:'Dólar / Real'},{s:'FX_IDC:EURBRL',d:'Euro / Real'},{s:'FX_IDC:GBPBRL',d:'Libra / Real'},{s:'FX_IDC:EURUSD',d:'Euro / Dólar'},{s:'FX_IDC:USDJPY',d:'Dólar / Iene'},{s:'FX_IDC:USDCNY',d:'Dólar / Yuan'},{s:'FX_IDC:EURGBP',d:'Euro / Libra'},{s:'FX_IDC:USDCHF',d:'Dólar / Franco'}],
  },
  crypto: {
    label:'Cripto',
    description:'Bitcoin, Ethereum e Solana em diferentes moedas e plataformas. Cotações de uma plataforma podem divergir das demais.',
    availability:'Cripto em tempo real conforme a plataforma de origem. Preços não incluem taxas ou execução de ordens.',
    symbols:[{s:'BITSTAMP:BTCUSD',d:'Bitcoin / Dólar'},{s:'COINBASE:BTCEUR',d:'Bitcoin / Euro'},{s:'BITSTAMP:ETHUSD',d:'Ethereum / Dólar'},{s:'KRAKEN:ETHEUR',d:'Ethereum / Euro'},{s:'COINBASE:SOLUSD',d:'Solana / Dólar'}],
  },
};
export function marketWidgetConfig(groupKey, theme='dark') {
  const group=MARKET_GROUPS[groupKey];
  if(!group)throw Error('Categoria de mercado inválida.');
  if(!['light','dark'].includes(theme))throw Error('Tema inválido.');
  return {colorTheme:theme,dateRange:'1D',locale:'br',width:'100%',height:650,
    isTransparent:false,showChart:true,showSymbolLogo:true,showFloatingTooltip:true,
    plotLineColorGrowing:'rgba(157,187,145,1)',plotLineColorFalling:'rgba(227,161,121,1)',
    belowLineFillColorGrowing:'rgba(157,187,145,0.10)',belowLineFillColorFalling:'rgba(227,161,121,0.10)',
    belowLineFillColorGrowingBottom:'rgba(157,187,145,0)',belowLineFillColorFallingBottom:'rgba(227,161,121,0)',
    gridLineColor:'rgba(128,128,128,0.08)',
    tabs:[{title:group.label,symbols:group.symbols}],
  };
}
