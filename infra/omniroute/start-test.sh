#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
trap 'unset OMNIROUTE_INITIAL_PASSWORD confirmation' EXIT
if ! command -v docker >/dev/null; then
  printf '%s\n' 'Docker ausente; teste não iniciado.' >&2
  exit 1
fi
printf '%s\n' 'Piloto isolado RiskLab. Use uma NOVA senha exclusiva do painel, não a chave da NVIDIA.'
read -r -s -p 'Nova senha do painel (mínimo 16 caracteres; entrada oculta): ' OMNIROUTE_INITIAL_PASSWORD
printf '\n'
read -r -s -p 'Repita a nova senha: ' confirmation
printf '\n'
if [[ ${#OMNIROUTE_INITIAL_PASSWORD} -lt 16 || "$OMNIROUTE_INITIAL_PASSWORD" != "$confirmation" ]]; then
  printf '%s\n' 'Senhas diferentes ou curtas; nada foi iniciado. Execute novamente.' >&2
  exit 1
fi
unset confirmation
export OMNIROUTE_INITIAL_PASSWORD
docker compose -f "$script_dir/compose.yaml" config --quiet
docker compose -f "$script_dir/compose.yaml" up -d --wait --wait-timeout 300
unset OMNIROUTE_INITIAL_PASSWORD
python3 "$script_dir/smoke.py"
printf '%s\n' 'Abra a porta 20128 com visibilidade PRIVADA no Codespaces. Não publicar o endpoint.'
