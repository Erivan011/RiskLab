# RiskLab — Laboratório de risco cambial

Projeto de Erivan Santos Marques para investigar perdas de uma exposição sintética a USD/BRL, EUR/BRL e GBP/BRL com dados oficiais BCB/SGS. Sem sinais de negociação.

## Implementação

- `analysis/`: coleta oficial, qualidade de dados, SQLite, backtests, previsão de variância e testes em Python.
- `web/`: aplicativo estático com motor analítico puro, cálculo em Web Worker e interface responsiva. Não depende de CDN, servidor de cálculo ou chave de API.
- `tests/`: comparação independente com previsões Python, testes de contribuições de risco, isolamento temporal, validação de entradas e configurações.

## Interface v0.4

1. **Limite:** confronto entre orçamento diário de perda e VaR, leitura separada do ES, folga e capacidade condicional de exposição. Volatilidade, drawdown e histórico de exceções complementam a análise.
2. **Composição:** pesos editáveis, validação da soma, correlações e decomposição de Euler da volatilidade.
3. **Backtesting:** comparação sob as mesmas condições, lista de exceções e distribuição de retornos.
4. **Estresse:** choques simultâneos por moeda e repetição dos piores dias observados.
5. **Modelos e dados:** experimento fixo de ML, protocolo temporal, hashes dos dados e limites.

Os pesos, a confiança (95%, 97,5%, 99%), a janela (126, 252, 504) e o ano avaliado recalculam as estimativas. O nocional apenas escala o P&L. Aplicar um novo cenário não altera a pesquisa fixa de aprendizado de máquina. A versão é um laboratório histórico; não é um sistema bancário de produção.

## Validar

```bash
node --test tests/risk-engine.test.mjs
cd analysis
python -m pip install -e .
python -m unittest discover -s tests -v
```

As 2.262 previsões do conjunto de teste (754 datas × 3 modelos), tanto VaR quanto ES, foram comparadas com a implementação independente em Python. Tolerância de 1e-10 para estimativas. P-valores de qui-quadrado com um grau de liberdade usam uma aproximação de erfc no navegador e são conferidos com tolerância de 2e-7 contra SciPy.

## Atualizar o snapshot

```bash
cd analysis
risklab --download --workspace-output ../web/dataset.json
```

Recorte fixo: 2016–2025. A API BCB não exige chave. Arquivos de origem validados são reaproveitados. Para uma nova pesquisa com outra data de corte, revise o protocolo e os recortes explicitamente.

## Premissas

Exposição comprada, pesos fixos, rebalanceamento diário, sem carry, spreads, custos, juros ou tributos. PTAX é referência, não preço executável. VaR não é perda máxima. ES não recebeu validação estatística específica. Os testes de cobertura não provam adequação do modelo. A base consultada hoje não reconstrói vintages nem horários históricos de divulgação.

A decomposição de Euler descreve a volatilidade da matriz de covariância da janela anterior à última previsão. Ela não é uma atribuição do VaR histórico. Os componentes somam a volatilidade; não confundir peso financeiro com participação no risco.

Exportação JSON inclui parâmetros, modelos, previsões, datas finais do treino e hashes. CSV de exceções contém frações de perda e excesso em reais, com nocional constante. Drawdown usa riqueza composta da exposição e tem o pico reiniciado no período escolhido.

## Dados e licença

Banco Central do Brasil / SGS, séries 1, 21619 e 21623. Os dados e as derivações mantêm atribuição e licença ODbL conforme `analysis/DATA_LICENSE.md`. Código MIT conforme `analysis/LICENSE`.

## Acesso

A implantação atual é privada e requer a conta ChatGPT do proprietário. Se o computador mostrar “Entre para acessar”, faça login com a mesma conta. O acesso privado não é um link público de portfólio.

## Dimensionamento condicional

O orçamento de perda é definido pelo usuário. A capacidade é `limite / taxa_de_VaR`, mantendo pesos, janela e estimador. Para VaR não positivo, a capacidade fica não identificável. O cálculo não otimiza a composição, não determina um hedge e não representa garantia ou aprovação de risco. A folga e a condição do ES são apresentadas separadamente. O relatório JSON registra o orçamento informado.

A interface foi reorganizada como um caderno de tesouraria, com capítulos horizontais, tabelas e notas. Os módulos de cálculo não dependem do tema visual.

## Mercado, posições e API — v0.4

A página inicial passa a mostrar as referências de USD/BRL, EUR/BRL e GBP/BRL com variação entre observações, janelas de 21/63/252 observações e comparação normalizada em base 100. O módulo de posições permite valores a receber e a pagar em moeda estrangeira; os sinais afetam exposição líquida, P&L, sensibilidade e cauda de perda.

A carteira é hipotética. Sua reprecificação usa nocionais atuais e retornos históricos em datas comuns, sem preenchimento de preços. P&L do último intervalo usa quantidades atuais × diferença entre as duas últimas referências comuns. VaR e ES de 99% são estimativas de simulação histórica da carteira atual, não resultados reais de uma carteira no passado.

A faixa de cenários usa 1.000 trajetórias de bootstrap em blocos de cinco retornos, com semente fixa e horizonte de 20 observações. A faixa de percentis 5–95 das trajetórias não constitui um intervalo de confiança calibrado para o preço futuro.

### Serviço de mercado

`GET /api/market` consulta somente três endpoints SGS fixos, com datas filtradas. A consulta reutiliza histórico validado do snapshot, tem timeout por série, distingue sucesso/parcial/snapshot e usa cache em memória de melhor esforço por até 15 minutos, por instância. O snapshot local aparece imediatamente enquanto a consulta acontece. Os dados são referências diárias, não streaming intradiário. Movimentos acima de 5% entre observações recebem aviso de conferência e não são apagados.

O Worker não recebe as quantidades da carteira: elas são calculadas no navegador e só entram no arquivo exportado pelo visitante. Não há chave de API, credencial embutida, endpoint de URL arbitrária ou execução de operações financeiras.

A neutralização de choque por cobertura é idealizada e linear. Ela não precifica hedge, derivativos, prazo, prêmio, base, crédito ou contraparte e não representa proteção contratada.

### Executar e construir

```bash
node scripts/build-site.mjs
node scripts/validate-artifact.mjs
npm test
npm run dev -- --port 4173
```

`web/` é a fonte da interface; `worker/server.mjs` é a fonte do serviço. O build determinístico incorpora os assets no Worker e gera `dist/server/index.js`. O artefato gerado é reconstruído no pipeline de publicação. As páginas de pesquisa e backtesting mantêm o experimento fixo de 2016–2025, separado do snapshot de mercado e da carteira editável.


## Mesa de análise de risco

A página inicial separa uma carteira de trabalho do experimento histórico das abas de pesquisa.
O motor `web/desk-engine.mjs` é independente do DOM e recebe referências já validadas,
quantidades assinadas, coberturas por moeda, choques independentes e orçamento de perda.

- Reprecifica a carteira atual nos últimos 252 retornos comuns.
- Atribui o ES por moeda nas **mesmas datas da cauda conjunta**; as parcelas reconciliam com o ES da carteira e podem ser negativas.
- Recalcula VaR e ES após neutralização linear por moeda; não presume que cobrir uma exposição sempre melhora a diversificação.
- Produz uma matriz USD × EUR condicionada ao choque GBP e calcula o choque adverso simétrico que esgota o orçamento residual.
- Exibe a distribuição empírica e o número de observações efetivamente usadas na cauda, para tornar a fragilidade amostral visível.

`web/desk.mjs` coordena entradas, estado de edição, comparação, exportação e histórico local.
O histórico é limitado a oito registros versionados por navegador e não usa backend nem sincronização.
Alterar uma entrada invalida registro/exportação até novo cálculo. Carregar uma análise restaura
as premissas e **recalcula com a base atual**, sem apresentar um resultado antigo como novo.

### Hipóteses de estresse reverso

Se G é a soma dos nocionais residuais absolutos e L o orçamento positivo, o choque adverso
simétrico é L/G, com direção oposta ao sinal de cada posição. Não representa uma probabilidade,
uma previsão ou uma sugestão de negociação. Para G=0, não se inventa um choque. Magnitudes
acima de 100% são sinalizadas como economicamente inviáveis para os componentes de queda.

### Verificação

`npm test` inclui reconciliação de ES, sinais receber/pagar, neutralização completa,
reprecificação assimétrica, estresse reverso, conservação da massa do histograma e regressões
da API. `npm run build` e `npm run validate` verificam o artefato Worker.


## Estudo brasileiro: Suzano S.A.

A abertura agora investiga por que a exposição operacional de uma exportadora e a exposição
contábil do balanço podem responder de maneiras diferentes ao câmbio. O recorte utiliza a
nota 4.4.1 das demonstrações financeiras consolidadas de 2025 da Suzano S.A.

Fonte: https://s201.q4cdn.com/761980458/files/doc_news/2026/02/DF/2025-12-DFP_Suzano_PT.pdf
Página 105 do PDF (nota na página impressa 36); consulta em 27/10/2026.

`web/suzano-case.json` é uma transcrição manual identificada, com data-base, unidade original,
oito rubricas e totais de controle. Não é um pipeline automatizado da CVM.
`web/company-engine.mjs` mantém valores em milhares de reais, reconcilia a divulgação e
aplica cenários comuns somente às seis rubricas não derivativas. Os valores justos de
derivativos aparecem na conciliação, sem serem confundidos com nocionais, delta ou caixa.

Testes conferem os três totais publicados, o tratamento dos sinais, a exclusão de derivativos,
a simetria da aproximação e a interrupção da simulação quando a base não reconcilia.
O cenário proporcional é uma hipótese do estudo, não a reprodução da sensibilidade
adversa por rubrica divulgada pela companhia. A exposição é substancialmente em USD.

O estudo ainda não mede caixa em risco nem otimiza a política de hedge. Para isso faltam
recebimentos e pagamentos por vencimento, evolução do preço da celulose, contratos e
curvas de desconto. A interface declara essas fronteiras em vez de atribuir operações
hipotéticas à empresa. O caso é independente e não possui vínculo com a Suzano.
