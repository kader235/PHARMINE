#!/usr/bin/env bash
# Reconstruit puis lance le banc d'aperçu.
#
# Un Electron resté ouvert verrouille les fichiers de `out/` sous Windows et
# fait échouer le build silencieusement : on nettoie d'abord.
set -u

taskkill //F //IM electron.exe >/dev/null 2>&1 || true
sleep 1

if ! npx electron-vite build > .build.log 2>&1; then
  echo "ECHEC DU BUILD :"
  tail -20 .build.log
  exit 1
fi

env -u ELECTRON_RUN_AS_NODE npx electron out/main/apercu.js > apercu.log 2>&1
code=$?
echo "code de sortie : $code"
grep -vE "^  capture" apercu.log | grep -v "^$" | tail -"${1:-30}"
echo "--- captures : $(ls apercu 2>/dev/null | wc -l) ---"
exit $code
