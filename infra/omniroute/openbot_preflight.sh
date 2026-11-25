#!/usr/bin/env bash
set -euo pipefail

if [[ $# != 1 || ! -f "$1/backend-images.env" || ! -f "$1/docker-compose.yml" ]]; then
  printf '%s\n' 'Uso: bash infra/omniroute/openbot_preflight.sh /caminho/para/OpenBot' >&2
  exit 2
fi

cd -- "$1"
compose=(docker compose --env-file backend-images.env)
if [[ -f .env ]]; then compose+=(--env-file .env); fi

if ! images=$("${compose[@]}" config --images 2>/dev/null); then
  printf '%s\n' 'Falha ao resolver imagens do Compose. Confira o checkout e os arquivos de configuração.' >&2
  exit 1
fi
if [[ -z "$images" || "$images" == *see-backend-images.env* ]]; then
  printf '%s\n' 'Tag do OpenBot inválida. Confira backend-images.env e os overrides das imagens.' >&2
  exit 1
fi

printf '%s\n' 'Tags do Compose resolvidas.'
failed=0
for port in 3010 20128; do
  status=$(curl --noproxy '*' -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$port/" 2>/dev/null) || status=000
  printf 'Porta local %s: HTTP %s\n' "$port" "$status"
  case "$status" in
    200|301|302|303|307|308) ;;
    *) failed=1 ;;
  esac
done

if (( failed )); then
  printf '%s\n' 'Um serviço não confirmou a página inicial. Confira docker compose ps no host correto.' >&2
fi
exit "$failed"
