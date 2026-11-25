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

## Pré-verificação do OpenBot no mesmo Codespace

Na raiz do checkout oficial do OpenBot, verifique primeiro a tag resolvida:

```bash
docker compose --env-file backend-images.env --env-file .env config --images
```

O arquivo `backend-images.env` vem com o checkout e define a tag correspondente. `see-backend-images.env` é o valor sentinela do Compose. Se aparecer na lista, corrija a resolução do arquivo antes de baixar imagens. Confira também se `OPENBOT_BACKEND_TAG`, `SERVER_IMAGE`, `COMPUTER_IMAGE` ou `SUPERVISOR_IMAGE` estão sobrescrevendo o valor. Evite imprimir o conteúdo do `.env`.

Para inicialização normal, use `./scripts/start.sh` no checkout oficial. Antes de insistir no build local que estourou memória, valide se as imagens oficiais daquela revisão estão disponíveis. Se houver uma rede antiga ausente, confira o projeto com `docker compose ps -a` e recrie os serviços desse projeto com a configuração correta. Preserve volumes e dados.

Depois de confirmar saúde do OpenBot e da OmniRoute no host local, rode o teste sintético deste README. Se funcionar isoladamente, valide o Assistente Geral e o Orquestrador individualmente com memória e ferramentas mínimas. Os logs relatados tinham até 148.290 tokens de entrada para um limite de 128.000. Reduzir a saída ou ajustar o esforço de raciocínio não encurta o histórico e as ferramentas já enviados. Só reative contexto e delegação por etapas após medir o tamanho de entrada de cada bot.

Referência: [configuração oficial do OpenBot](https://github.com/CopilotKit/OpenBot/blob/main/docs/configuration.md#backend-images).

Use `bash infra/omniroute/openbot_preflight.sh /caminho/para/OpenBot` no host que executa os serviços. O preflight valida a resolução das tags do Compose e checa as portas locais sem exibir configurações ou respostas. Se localhost estiver saudável e a URL encaminhada retornar 404, a investigação passa para o encaminhamento e a sessão do Codespace. Um 404 de link encaminhado sozinho não comprova falha do modelo.
