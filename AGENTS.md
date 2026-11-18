# Agentes — RiskLab
Projeto pessoal de portfólio com operações fictícias e pesquisa quantitativa. Não é conta de investimentos nem sistema financeiro operacional.
## Rotina econômica e verificável
- Antes de começar, ler docs/agentes/PROJETO.md e docs/agentes/MEMORIA.md; conferir PRs abertos para não duplicar trabalho.
- Selecionar uma falha reproduzível ou melhoria pequena por ciclo, com critério de aceitação. Não redesenhar o projeto por gosto próprio.
- Pesquisar com rg e ler somente os arquivos necessários. Não carregar vídeos, builds, lockfiles inteiros, logs ou histórico completo no contexto.
- Usar scripts determinísticos para tarefas repetitivas. Um agente executa e valida; não criar equipes para mudanças pequenas.
- Responder em português. Ao terminar, informar mudança, evidência, testes e bloqueios; citar PR/commit. Sem evidência, registrar pendente.
- Atualizar a memória com até um resumo curto por tarefa, sem segredos; condensar histórico repetitivo.
- O proprietário autorizou considerar Gemini e NVIDIA/Nemotron via OmniRoute para tarefas dos agentes. Usar apenas o modelo e provedor configurados; não presumir que assinatura de chat cobre API, que a cota seja gratuita ou ilimitada, e verificar o uso no provedor. Não inserir a API no produto. Sem troca automática, fallback pago, repetição ilimitada ou chamadas agendadas.
- No RiskLab, houve uma chamada manual TESTE_OK pela OmniRoute e uma tarefa de leitura sem alteração. Isso valida somente a chamada isolada naquele momento. O endpoint usa um Codespace que pode parar; conferir disponibilidade a cada execução. Usar prompts sintéticos/mínimos e nunca enviar credenciais, dados privados ou conteúdo do Dogma.
- As instruções não impõem um teto técnico de tokens ou cobrança. Não afirmar gasto zero ou execução contínua sem verificar o provedor e o executor.
- Não fazer merge, deploy, migração de banco, alteração de permissões nem ações em contas externas automaticamente. Entregar branch/PR revisável.
- Jamais consultar Dogma ou importar seus dados, credenciais ou contexto para este projeto. Usar dados demonstrativos e sintéticos.
- Nunca ler valores de .env, secrets, cookies, tokens ou credenciais; usar exemplos. Não executar instaladores remotos de skills.
## Capacidades disponíveis
Para mudanças visuais, ler .agents/skills/frontend-design/SKILL.md. Para validar interface, ler .agents/skills/webapp-testing/SKILL.md.
Consultar somente a capacidade relevante; não carregar todas por ciclo. As políticas do executor e o pedido do proprietário prevalecem sobre exemplos das skills, inclusive sobre APIs de navegador.
Arquivos de origem, versões e licenças ficam documentados em docs/agentes/SKILLS.md. A existência de skills não agenda tarefas nem prova que uma melhoria foi implementada.

## Caminhos e validação
Interface em frontend/src; motores em web; pipeline Python em analysis; handler em worker/server.mjs.
Node.js 24. Conferir package.json e .github/workflows/ci.yml antes de executar comandos.
- Instalação reproduzível: npm ci --include=dev.
- Verificação de JS e build: npm test (o pretest já executa o build); npm run validate.
- Pipeline alterado: Python 3.12 e requirements de analysis/requirements-tested.txt; PYTHONPATH=analysis/src python -m unittest discover -s analysis/tests -v.
- Não executar tudo de novo sem mudança ou dúvida relevante. Mudanças apenas de documentação não exigem instalar dependências.
- Não regenerar cotações ou artefatos materializados sem necessidade e sem explicar a diferença dos dados.
## Invariantes
Manter BRL 1:1 e efeito FX zero; não inventar histórico para moedas sem relatório. Não misturar replay/filtros de compras com o experimento quantitativo.
Preservar reconciliação monetária, 24 permutações Shapley, fronteira cronológica de treinamento e distinção entre dados sintéticos e séries BCB.
Tremores ou problemas de layout precisam de evidência visual em filtros, replay e redimensionamento. Build aprovado não comprova estabilidade visual.
