# Agentes de manutenção do RiskLab

Cada ciclo executa as verificações em `scripts/agent-checks.json`, com tempo máximo de seis minutos por verificação. A saída de cada comando vai para o log. O resumo registra o resultado, compara com o ciclo anterior e distingue falha nova, repetida ou recuperada. O histórico guarda os últimos 30 ciclos em `.agent-state/history.json`, com commit, duração e estado. No GitHub Actions, o cache restaura o histórico por branch quando disponível e o artefato registra o histórico daquele ciclo.

## Execução

Use Node.js 24 e Python 3.12. Instale as dependências com `npm ci --ignore-scripts`. Execute `python scripts/agent_cycle.py`. O GitHub Actions executa o mesmo ciclo às segundas, às 9h37 de Brasília, após o workflow chegar à branch padrão. Há também execução manual em **Actions → Agentes de manutenção**. O agendamento pode sofrer atrasos ou ser suspenso pelo GitHub após 60 dias sem atividade em um repositório público.

O histórico ajusta o diagnóstico de cada ciclo. Ele guarda evidências, sem retreinar o modelo. O fluxo usa permissão de leitura no GitHub e registra recomendações sem aplicar mudanças automaticamente.

## Diagnóstico por IA local

Com o Ollama vinculado a `127.0.0.1:11434` e o modo local habilitado (`OLLAMA_NO_CLOUD=1`), instale o modelo com `ollama pull qwen2.5:0.5b`. Execute:

```bash
python scripts/agent_cycle.py --ollama-model qwen2.5:0.5b
```

O agente envia uma única chamada à API local. A entrada contém somente IDs, estados e tendências das verificações. A saída curta aponta uma evidência conhecida e sugere uma verificação. O modelo não recebe logs, código, chaves ou dados operacionais e não tem acesso a ferramentas. Os resultados dos testes continuam sendo a fonte do estado do ciclo.

Referências: [API do Ollama](https://docs.ollama.com/api/generate), [modo local](https://docs.ollama.com/faq), [agendamentos do GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
