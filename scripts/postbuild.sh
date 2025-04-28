#!/bin/sh

echo "[postbuild.sh] Copying assets..."
mkdir -p dist
cp -R prompts dist/
cp -R screenshots dist/

echo "[postbuild.sh] Starting node server..."
node dist/index.js 