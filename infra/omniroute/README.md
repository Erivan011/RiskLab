# OmniRoute — teste seguro da API (RiskLab)

Este helper envia uma única chamada de teste com `reasoning_effort: "none"`.

## Executar no Codespace onde a OmniRoute está em execução

Abra o terminal do Codespace na raiz do repositório e rode:

```bash
python3 infra/omniroute/test_api_secure.py
```

Aceite `http://127.0.0.1:20128` se essa for a porta local da OmniRoute. O script solicita o ID do modelo e depois a chave de cliente da OmniRoute com entrada oculta. Use a chave de cliente criada no painel do OmniRoute, não a chave da NVIDIA.

A chave não é salva em arquivo nem exibida pelo script. Não a cole em chats, arquivos do repositório, comandos ou capturas de tela. O teste envia somente a mensagem fictícia `Responda APENAS: TESTE_OK`, com limite curto de saída.

O endpoint é restrito a localhost HTTP ou HTTPS em `*.app.github.dev`. Para manter o piloto isolado, execute localmente dentro do próprio Codespace sempre que possível; não torne a porta pública.

Este helper não instala nem inicia o OmniRoute, não altera o ambiente do Dogma e não testa nenhuma inferência até ser executado por você no host autorizado.
