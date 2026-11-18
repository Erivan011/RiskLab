# Piloto isolado do OmniRoute — RiskLab

Estado em 18/11/2026: uma chamada manual de inferência retornou `TESTE_OK` e o perfil do OpenHands Cloud concluiu uma tarefa de leitura do contexto do RiskLab. O teste do agente leu apenas documentação, não alterou arquivos e não acessou Dogma. Nenhuma chave ou URL específica do Codespace foi incluída no repositório.

O piloto continua temporário: o roteador depende de um Codespace ativo. Não é uma implantação persistente nem uma garantia de custo zero.

## Escopo

Testar conexão compatível com OpenAI usando exclusivamente mensagens fictícias.
Nenhum código privado, arquivo de usuário, cookie, sessão ou dado do Dogma entra
neste piloto. Não importar contas, tokens de navegador ou provedores por cookies.
O volume é próprio do piloto; o repositório não é montado no contêiner.

O OmniRoute roteia chamadas; não executa o agente e não remove o teto de tempo
ou de conversas do OpenHands Cloud. Ele também não transforma assinatura de chat
em cota gratuita de API nem elimina as condições dos provedores.

## Requisitos e início

- Host com Docker Engine 24+/Compose v2 e aproximadamente 2 GB de RAM livres,
  além da memória do sistema. O host precisa permanecer ligado.
- Esta pasta deve estar em um host de teste, separado da produção.
- A imagem do Compose é fixada por digest; reavalie a origem e atualizações
  antes de uso prolongado.

1. Copiar `.env.example` para `.env` nesta pasta e preencher uma senha exclusiva.
   A configuração falha se a senha estiver vazia. Não colocar chaves de provedores
   nesse arquivo nem em commits.
2. Executar `docker compose --env-file .env -f compose.yaml config --quiet`.
   Não imprimir a configuração expandida, pois contém a senha.
3. Executar `docker compose --env-file .env -f compose.yaml up -d --wait`.
4. Abrir `http://127.0.0.1:20128`, concluir o onboarding com login e conferir
   que a exigência de chave da API está ativa. Não pular a senha do painel.
5. Executar `python smoke.py`. O teste consulta saúde e verifica a recusa de
   uma chamada sem autenticação; não envia chave nem realiza inferência.

## Gate antes de testar um modelo

Uma inferência manual já retornou `TESTE_OK`. Isso confirma a resposta naquele
momento, não confirma custo zero, cota futura nem disponibilidade contínua.

- Selecionar explicitamente apenas um modelo com API gratuita confirmada.
- Não usar `auto`, `auto/cheap`, importação automática de provedores ou combos
  com modelos pagos. Menor preço não significa gratuito.
- Ao receber 429, cota esgotada, bloqueio de cobrança ou indisponibilidade,
  encerrar o teste; não trocar de conta, contornar limites ou ativar pagamento.
- Gemini gratuito: somente texto fictício, sujeito à política de uso de dados.
- NVIDIA gratuita: somente avaliação interna, dentro dos termos de trial.
- Não cadastrar a chave do Dogma, do GitHub ou de serviços de produção.
- Uma inferência manual futura deve conter somente `Responda APENAS: TESTE_OK`,
  com saída curta. Conferir resposta, modelo efetivo e consumo no provedor.
- Não usar Gemini/NVIDIA em execução automática neste projeto sem autorização
  explícita e revisão separada.

## Conexão ao OpenHands Cloud

`127.0.0.1` é acessível somente no host do router. O OpenHands Cloud não alcança
o localhost do PC nem deste ambiente. Não configurar esse endereço no perfil
cloud como se fosse um endpoint remoto.

Para a validação manual, o proprietário autorizou usar a porta HTTPS encaminhada
pelo Codespaces com visibilidade pública e autenticação de chave do OmniRoute.
Esse túnel expõe o endpoint externamente: não inclua sua URL nem sua chave em
issues, PRs, logs ou mensagens. Não envie dados do Dogma ou dados reais.

O Codespace pode parar por inatividade. Quando isso ocorreu, o roteador parou e
a porta voltou para Private; o OpenHands retornou HTTP 404. Após reiniciar, foi
necessário iniciar o contêiner e restaurar a visibilidade da porta. Portanto,
essa configuração não é persistente nem adequada para uso contínuo.

Antes de uma integração remota permanente, é necessário host persistente, HTTPS,
autenticação verificada, revisão de logs/retenção e permissão específica para
esse destino. Não abrir portas, túneis públicos ou serviços pagos automaticamente.
O Dogma permanece excluído. Não trocar o Default global.

## Encerrar

`docker compose --env-file .env -f compose.yaml down` para encerrar o piloto.
Não usar `down -v` sem decidir explicitamente apagar o estado e as chaves.

## Origem consultada

- https://github.com/cheaper-inference/OmniRoute/blob/release/v3.8.55/docs/getting-started/SELF_HOST_GUIDE.md
- https://github.com/cheaper-inference/OmniRoute/blob/release/v3.8.55/docs/guides/DOCKER_GUIDE.md

O Compose é mínimo e próprio deste piloto, baseado no fluxo oficial de contêiner
único. Não inclui Redis externo, captura de tráfego ou acesso a repositórios.
