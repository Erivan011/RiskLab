# Material para Power BI Desktop — não é um PBIX validado

O ambiente de desenvolvimento desta entrega não executa Power BI Desktop. Não há
arquivo PBIX criado ou validado. Os arquivos fornecem consulta M e medidas para
reproduzir os indicadores no Desktop, preservando a origem sintética.

1. Crie uma consulta em branco chamada `FactPurchase` e cole `FactPurchase.pq` no
   Editor Avançado. Autenticação anônima; origem pública sem credenciais.
2. Crie referências da fato e remova duplicados para `DimSupplier` (supplier),
   `DimCategory` (category), `DimCurrency` (currency), `DimSKU` (sku). Relacione cada
   dimensão 1:* à fato, com direção única.
3. Crie calendário diário contínuo e relacione Date a orderDate. Relações a
   promisedDate, deliveryDate e dueDate ficam inativas para medidas específicas.
4. Adicione individualmente as expressões de `measures.dax`; formate BRL como moeda
   e proporções como percentual.
5. Páginas: visão mensal, orçamento/realizado, fornecedores (pontualidade vs gasto),
   pedidos e qualidade. Use os mesmos segmentadores das dimensões e calendário.
6. Reconcilie com o JSON publicado e a exportação do dashboard. Não some taxas
   nem misture valores em moedas estrangeiras. Pontualidade usa apenas entregues;
   pendentes vencidos precisam ser apresentados separadamente.

A decomposição Shapley e os intervalos de Wilson estão implementados e testados na
aplicação web, não nestas medidas DAX. Esta documentação não afirma paridade completa.

Referências: Microsoft Learn, Web.Contents / Json.Document, SUMX e DIVIDE.
