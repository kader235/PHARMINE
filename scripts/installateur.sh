#!/usr/bin/env bash
# Construit l'installateur Windows.
#
# PHARMINA_SANS_TESTS retire le banc d'apercu et le scenario de bout en bout
# du bundle : ils n'ont rien a faire chez le client.
set -eu

taskkill //F //IM electron.exe >/dev/null 2>&1 || true
sleep 1

# Le repertoire des produits est recompile depuis sa source : l'installateur ne
# doit jamais embarquer une version plus ancienne que le fichier texte du depot.
ELECTRON_RUN_AS_NODE=1 npx electron scripts/repertoire.js

export PHARMINA_SANS_TESTS=1
npx electron-vite build
npx electron-builder --win

echo
echo "Contenu de release/ :"
ls -la release/*.exe 2>/dev/null || echo "  aucun executable produit"
