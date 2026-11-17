# Briefing — RiskLab
## Objetivo
Portfólio pessoal para investigar custo de compras, fornecedores e exposição cambial. A demonstração usa React/TypeScript/Recharts; processamento Python gera artefatos consumidos pelo navegador.
## Fonte de verdade
README.md, package.json e .github/workflows/ci.yml descrevem o estado atual. O briefing não transforma comportamento defeituoso em requisito.
## Prioridades
1. Corrigir erros reproduzíveis de filtros, gráficos, reconciliação e estados vazios.
2. Melhorar navegação, leitura dos indicadores, teclado, foco e responsividade, preservando tema e identidade existentes.
3. Explicar origem, data e limitações dos dados sem alegar tempo real.
## Critérios de aceitação
- Uma mudança por tarefa com antes/depois verificável; preservar seleção de país/moeda/fornecedor e valores corretos.
- Dados de compras fictícios continuam identificados como fictícios; relatórios BCB são separados e datados.
- Filtros não atribuem causalidade à decomposição Shapley nem fabricam modelos de risco.
- Validar erros/vazio e pelo menos uma largura móvel e desktop quando tocar interface; respeitar reduced-motion.
- Nenhuma informação do Dogma, senha, token ou dado pessoal em fixtures, prints, memória ou PR.
## Primeira investigação
Conferir a saúde dos checks e reproduzir a tarefa escolhida antes de alterar código. Não assumir bug visual apenas pela presença de animação.
