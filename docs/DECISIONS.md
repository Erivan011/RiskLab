# Decisões de implementação

## Motor independente do DOM

As funções de domínio recebem dados explícitos e não acessam rede, relógio, armazenamento ou interface. A data-base é entrada. Isso permite testar cálculos, reutilizar o motor e verificar a conservação dos totais independentemente da renderização.

## Centavos na agregação

O valor convertido é arredondado por operação e depois agregado em inteiros de centavos. A aplicação não apresenta uma soma de parcelas arredondadas que diverge do total. Não substitui um ledger contábil de produção nem elimina todos os limites de ponto flutuante no cálculo anterior ao arredondamento.

## Projeção em degraus

O dinheiro se movimenta nas datas dos eventos. Recebimentos e pagamentos na mesma data são agregados; não se assume ordem intradiária. O saldo mínimo considera o caixa inicial, e vencidos são alocados na data-base uma única vez. A UI deixa explícita essa simplificação.

## Referências datadas e snapshot

Uma consulta de rede só substitui o conjunto de referências se passar no contrato de datas e preços. Uma falha preserva o último conjunto válido. A demonstração não usa pontos posteriores à sua data-base. Variações superiores a 5% são sinalizadas para inspeção, sem apagar ou suavizar observações.

## Dados fictícios separados de dados oficiais

Os pedidos, fornecedores, recebimentos e taxas fixas são demonstrativos. Um balanço real ou uma referência oficial não transforma essas hipóteses em operações reais. O estudo público da Suzano permanece separado do workspace operacional.

## Persistência local e fronteira de produção

Escolheu-se armazenamento no navegador para uma demonstração pública sem banco, custos ou circulação de dados de empresas. Não oferece colaboração, recuperação centralizada, controle de acesso por papel nem trilha inviolável. Esses requisitos exigiriam API autenticada, banco e regras próprias; a aplicação não declara possuí-los.

## CSV sem substituição parcial

O arquivo inteiro é validado antes da troca da carteira, com limite de tamanho e quantidade, IDs únicos, moedas suportadas e regras numéricas. Valores textuais são escapados na UI e prefixos de fórmula são neutralizados na exportação. O CSV é contrato de intercâmbio, não uma planilha de cálculo executável.

## Estresse de tesouraria combinado

`treasury-engine.mjs` compõe choque paralelo nas moedas suportadas, atraso inteiro em dias corridos e redução proporcional dos recebimentos. Não pressupõe distribuições, probabilidades, juros, limites bancários ou hedge executável. Recebimentos anteriores à data-base não são recolocados no futuro: estão refletidos no caixa inicial. As entradas são arredondadas individualmente em centavos.

A necessidade adicional é `max(0, -menor saldo diário)`: um aporte disponível desde a data-base que elimina saldos negativos no horizonte. Não equivale ao déficit final, exposição cambial, VaR nem perda esperada. A matriz tem 20 combinações determinísticas e conserva a premissa de redução de recebimentos selecionada.

A atribuição de necessidade é sequencial: base → câmbio → atraso → redução. Deltas reconciliam exatamente com o resultado combinado. Há interação entre fatores; trocar a ordem pode mudar a atribuição. Não se apresenta essa decomposição como estimativa causal ou Shapley.

O relatório JSON captura carteira, recebimentos, taxas e datas de referência, premissas, horizonte, ledger diário e resultados em centavos, para reprodução com o mesmo motor. Dados e premissas do experimento não substituem o workspace salvo.
