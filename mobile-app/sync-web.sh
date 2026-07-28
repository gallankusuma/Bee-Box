#!/bin/bash
# Copies the student web app (project root) into www/ so Capacitor can wrap
# it. Run this before `npx cap sync` any time index.html/game.js/questions.js
# /style.css change at the project root.
set -e
cd "$(dirname "$0")"
cp ../index.html ../game.js ../questions.js ../style.css www/
echo "Synced student app into mobile-app/www/"
