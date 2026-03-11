#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  ESB Runtime — start script (Linux / macOS)
#  Port    : 9090
#  Profile : demo (default) | init | production
# ─────────────────────────────────────────────────────────────

JAR="esb-runtime/target/esb-runtime-*.jar"
LOG="logs/runtime.log"
PORT="${PORT:-9090}"
PROFILE="${PROFILE:-demo}"
STORE_DIR="${STORE_DIR:-$(pwd)/esb-runtime/routes/dev}"

# ── find the JAR ──────────────────────────────────────────────
JAR_PATH=$(ls $JAR 2>/dev/null | head -1)
if [ -z "$JAR_PATH" ]; then
  echo "ERROR: Runtime JAR not found at $JAR"
  echo "Run: mvn clean package -DskipTests"
  exit 1
fi

# ── kill existing instance ────────────────────────────────────
EXISTING=$(lsof -ti tcp:$PORT 2>/dev/null)
if [ -n "$EXISTING" ]; then
  echo "Stopping existing runtime on port $PORT (PID $EXISTING)..."
  kill -9 $EXISTING 2>/dev/null
  sleep 1
fi

# ── create log dir ────────────────────────────────────────────
mkdir -p logs

echo "Starting ESB Runtime..."
echo "  JAR     : $JAR_PATH"
echo "  Port    : $PORT"
echo "  Profile : $PROFILE"
echo "  Routes  : $STORE_DIR"
echo "  Log     : $LOG"
echo ""

nohup java -jar "$JAR_PATH" \
  --spring.profiles.active="$PROFILE" \
  --server.port="$PORT" \
  --esb.routes.store-dir="$STORE_DIR" \
  > "$LOG" 2>&1 &

PID=$!
echo "PID: $PID"
echo "$PID" > logs/runtime.pid

sleep 3
if kill -0 $PID 2>/dev/null; then
  echo "Runtime started successfully."
  echo ""
  echo "  Health : http://localhost:$PORT/manage/health"
  echo "  Routes : http://localhost:$PORT/manage/routes"
  echo "  Log    : tail -f $LOG"
else
  echo "ERROR: Runtime failed to start. Check: $LOG"
  exit 1
fi
