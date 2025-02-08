#!/bin/bash

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

if [ -s .venv/bin/activate ]; then
  exit 0
elif [ -d node_modules ] && [ "$(ls -A node_modules)" ]; then
  exit 0
else
  echo -e "${RED}ERROR!${NC} Module dependencies are not found, please execute ${GREEN}npm run install${NC} first."
  exit 1
fi
