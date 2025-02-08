#!/bin/bash

# Load .env file
if [ ! -f .env ]; then
  echo "Error: .env file not found"
  exit 1
fi

set +e
source .env
set -e

# Remove $RES_DIR directory
if [ -d "$RES_DIR" ]; then
  rm -rf "$RES_DIR"
fi

# Remove $OUT_DIR directory
if [ -d "$OUT_DIR" ]; then
  rm -rf "$OUT_DIR"
fi

# Process folders in the format $number-$name
for folder in *-*; do
  if [ -d "$folder" ]; then
    # Check if the folder name starts with a number
    if [[ "$folder" =~ ^[0-9]+- ]]; then
      # Remove .venv directory
      if [ -d "$folder/.venv" ]; then
        rm -rf "$folder/.venv"
      fi

      # Remove node_modules directory
      if [ -d "$folder/node_modules" ]; then
        rm -rf "$folder/node_modules"
      fi

      # Remove package-lock.json file
      if [ -f "$folder/package-lock.json" ]; then
        rm "$folder/package-lock.json"
      fi
    fi
  fi
done

# clean up data dir
rm -f data/parsed-*.json
