#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo 'Install Node.js 22 or newer (with npm) first.' >&2
  exit 1
fi
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo 'Created .env. Configure AWS_REGION and DB_SECRET_ID, then rerun this script.'
  exit 0
fi
npm install
npm run check
npm test
exec npm start
