#!/bin/bash
# ============================================================
#  lancer-studyide-silencieux.sh
#  Lance StudyIDE sans garder de terminal visible (usage
#  quotidien). Si les dépendances ne sont pas encore
#  installées, bascule sur lancer-studyide.run (terminal
#  visible) pour voir la progression la première fois.
#
#  Astuce : dans la plupart des gestionnaires de fichiers
#  (Nautilus, Nemo, Dolphin...), fais un clic droit sur ce
#  fichier > Propriétés > Permissions > coche "Autoriser
#  l'exécution comme un programme", puis choisis "Exécuter"
#  (pas "Exécuter dans un terminal") au double-clic.
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
cd "$SCRIPT_DIR"

if [ -d "node_modules" ]; then
  setsid nohup npm start > /dev/null 2>&1 &
  disown
else
  exec "$SCRIPT_DIR/lancer-studyide.run"
fi
