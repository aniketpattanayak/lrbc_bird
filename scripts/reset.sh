#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# Reset local development environment — wipes all data and starts fresh
# WARNING: Destroys ALL local data (database, Redis, MinIO)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}⚠️  WARNING: This will destroy ALL local data!${NC}"
echo ""
read -rp "Type 'yes' to confirm: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Reset cancelled."
  exit 0
fi

echo ""
echo "Resetting environment..."

# Stop all containers
docker compose down -v --remove-orphans
echo -e "${GREEN}✓${NC} Docker containers and volumes removed"

# Remove Turbo cache
rm -rf .turbo
echo -e "${GREEN}✓${NC} Turbo cache cleared"

# Remove all build artifacts
find . -name "dist" -not -path "*/node_modules/*" -type d -exec rm -rf {} + 2>/dev/null || true
find . -name ".next" -not -path "*/node_modules/*" -type d -exec rm -rf {} + 2>/dev/null || true
echo -e "${GREEN}✓${NC} Build artifacts cleared"

echo ""
echo "Running setup..."
bash scripts/setup.sh
