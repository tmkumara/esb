#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "============================================================"
echo " ESB Platform Demo Environment"
echo "============================================================"
echo ""

echo "[1/3] Starting ESB Runtime (port 9090)..."
cd "$SCRIPT_DIR/esb-runtime"
mvn spring-boot:run -Dspring-boot.run.profiles=demo &
RUNTIME_PID=$!

echo "Waiting 15 seconds for Runtime to initialise..."
sleep 15

echo "[2/3] Starting ESB Designer (port 9191)..."
cd "$SCRIPT_DIR/esb-designer"
mvn spring-boot:run &
DESIGNER_PID=$!

echo "Waiting 5 seconds for Designer to initialise..."
sleep 5

echo "[3/3] Starting ESB UI (port 3000)..."
cd "$SCRIPT_DIR/esb-ui"
npm run dev:designer &
UI_PID=$!

echo ""
echo "============================================================"
echo " All services starting:"
echo "   Runtime  -> http://localhost:9090"
echo "   Designer -> http://localhost:9191"
echo "   UI       -> http://localhost:3000"
echo "============================================================"
echo ""
echo "Press Ctrl+C to stop all services."

# Wait and propagate Ctrl+C
trap "kill $RUNTIME_PID $DESIGNER_PID $UI_PID 2>/dev/null; exit 0" INT TERM
wait
