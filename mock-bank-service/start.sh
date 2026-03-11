#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Mock Bank SOAP Service — start script (Linux / macOS)
# ─────────────────────────────────────────────────────────────

JAR="mock-bank-service.jar"
LOG="mock-bank.log"
PORT="${1:-8085}"

if [ ! -f "$JAR" ]; then
  echo "ERROR: $JAR not found."
  echo "Run: mvn clean package -DskipTests  then copy target/mock-bank-service.jar here."
  exit 1
fi

# Kill any existing instance on the same port
EXISTING=$(lsof -ti tcp:$PORT 2>/dev/null)
if [ -n "$EXISTING" ]; then
  echo "Stopping existing process on port $PORT (PID $EXISTING)..."
  kill -9 $EXISTING 2>/dev/null
  sleep 1
fi

echo "Starting Mock Bank SOAP Service on port $PORT..."
nohup java -jar "$JAR" --server.port="$PORT" > "$LOG" 2>&1 &

PID=$!
echo "PID: $PID"
echo "Log: tail -f $LOG"
echo ""
echo "Endpoints:"
echo "  SOAP : http://$(hostname -I | awk '{print $1}'):$PORT/soap/balance-service"
echo "  WSDL : http://$(hostname -I | awk '{print $1}'):$PORT/soap/balance-service  (GET)"
echo "  Health: http://$(hostname -I | awk '{print $1}'):$PORT/soap/health"
