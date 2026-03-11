#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  ESB Designer — start script (Linux / macOS)
#  Port    : 9191
# ─────────────────────────────────────────────────────────────

JAR="esb-designer/target/esb-designer-*.jar"
LOG="logs/designer.log"
PORT="${PORT_DESIGNER:-9191}"
STORE_DIR="${STORE_DIR:-$(pwd)/esb-runtime/routes/dev}"
CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3000,http://localhost:6060}"

# ── find the JAR ──────────────────────────────────────────────
JAR_PATH=$(ls $JAR 2>/dev/null | head -1)
if [ -z "$JAR_PATH" ]; then
  echo "ERROR: Designer JAR not found at $JAR"
  echo "Run: mvn clean package -DskipTests"
  exit 1
fi

# ── kill existing instance ────────────────────────────────────
EXISTING=$(lsof -ti tcp:$PORT 2>/dev/null)
if [ -n "$EXISTING" ]; then
  echo "Stopping existing designer on port $PORT (PID $EXISTING)..."
  kill -9 $EXISTING 2>/dev/null
  sleep 1
fi

# ── create log dir ────────────────────────────────────────────
mkdir -p logs

echo "Starting ESB Designer..."
echo "  JAR     : $JAR_PATH"
echo "  Port    : $PORT"
echo "  Routes  : $STORE_DIR"
echo "  CORS    : $CORS_ORIGINS"
echo "  Log     : $LOG"
echo ""

nohup java -jar "$JAR_PATH" \
  --server.port="$PORT" \
  --esb.designer.routes-output-dir="$STORE_DIR" \
  --esb.cors.allowed-origins="$CORS_ORIGINS" \
  > "$LOG" 2>&1 &

PID=$!
echo "PID: $PID"
echo "$PID" > logs/designer.pid

sleep 3
if kill -0 $PID 2>/dev/null; then
  echo "Designer started successfully."
  echo ""
  echo "  Validate : POST http://localhost:$PORT/manage/routes/validate"
  echo "  Preview  : POST http://localhost:$PORT/manage/transforms/preview"
  echo "  Save     : POST http://localhost:$PORT/manage/routes/save"
  echo "  Log      : tail -f $LOG"
else
  echo "ERROR: Designer failed to start. Check: $LOG"
  exit 1
fi
