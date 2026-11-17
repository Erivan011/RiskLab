# Piloto isolado do OmniRoute — RiskLab

Estado: preparação para avaliação, sem implantação nem chave cadastrada.
Não altera o aplicativo, o deploy do RiskLab ou os modelos do OpenHands.

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
- O ambiente onde este pacote foi preparado não tem Docker: não houve pull,
  inicialização, teste HTTP real ou validação de modelo.

1. Copiar `.env.example` para `.env` nesta pasta e preencher uma senha exclusiva.
   A configuração falha se a senha estiver vazia. Não colocar chaves de provedores
   nesse arquivo nem em commits.
2. Conferir a imagem oficial e selecionar uma versão/digest revisado antes de uso
   permanente. `latest` neste piloto é uma referência mutável, sem atualizador
   automático e sem garantia de que inclua os últimos commits do projeto.
3. Executar `docker compose --env-file .env -f compose.yaml config --quiet`.
   Não imprimir a configuração expandida, pois contém a senha.
4. Executar `docker compose --env-file .env -f compose.yaml up -d`.
5. Abrir `http://127.0.0.1:20128`, concluir o onboarding com login e conferir
   que a exigência de chave da API está ativa. Não pular a senha do painel.
6. Executar `python smoke.py`. O teste consulta saúde e verifica a recusa de
   uma chamada sem autenticação; não envia chave nem realiza inferência.

## Gate antes de testar um modelo

Não há garantia técnica de custo zero apenas pelo arquivo Compose. Não cadastrar
provedor antes de conferir o plano e a ausência de faturamento habilitado.

- Selecionar explicitamente apenas um modelo com API gratuita confirmada.
- Não usar `auto`, `auto/cheap`, importação automática de provedores ou combos
  com modelos pagos. Menor preço não significa gratuito.
- Ao receber 429, cota esgotada, bloqueio de cobrança ou indisponibilidade,
  encerrar o teste; não trocar de conta, contornar limites ou ativar pagamento.
- Gemini gratuito: somente texto fictício, sujeito à política de uso de dados.
- NVIDIA gratuita: somente avaliação interna, dentro dos termos de trial.
- Não cadastrar a chave do Dogma, do GitHub ou de serviços de produção.
- Uma primeira inferência manual deve conter somente `Responda APENAS: TESTE_OK`,
  com saída curta. Conferir resposta, modelo efetivo e consumo no provedor.

## Conexão ao OpenHands Cloud

`127.0.0.1` é acessível somente no host do router. O OpenHands Cloud não alcança
o localhost do PC nem deste ambiente. Não configurar esse endereço no perfil
cloud como se fosse um endpoint remoto.

Antes de integração remota, é necessário host persistente, HTTPS, autenticação
verificada, revisão de logs/retenção e permissão específica para esse destino.
Não abrir portas, túnel público ou novo serviço pago automaticamente. O Dogma
permanece excluído. Só conectar o perfil de teste do RiskLab após aprovação do
teste; não trocar o Default global.

## Encerrar

`docker compose --env-file .env -f compose.yaml down` para encerrar o piloto.
Não usar `down -v` sem decidir explicitamente apagar o estado e as chaves.

## Origem consultada

- https://github.com/cheaper-inference/OmniRoute/blob/release/v3.8.55/docs/getting-started/SELF_HOST_GUIDE.md
- https://github.com/cheaper-inference/OmniRoute/blob/release/v3.8.55/docs/guides/DOCKER_GUIDE.md

O Compose é mínimo e próprio deste piloto, baseado no fluxo oficial de contêiner
único. Não inclui Redis externo, captura de tráfego ou acesso a repositórios.
