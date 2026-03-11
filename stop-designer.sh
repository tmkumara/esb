#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  ESB Designer — stop script (Linux / macOS)
# ─────────────────────────────────────────────────────────────

PORT="${PORT_DESIGNER:-9191}"
LOG="logs/designer.log"
PID_FILE="logs/designer.pid"

echo "Stopping ESB Designer on port $PORT..."

# Try PID file first
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 $PID 2>/dev/null; then
    kill -9 $PID 2>/dev/null
    echo "Stopped PID $PID (from pid file)"
    rm -f "$PID_FILE"
  fi
fi

# Fallback — kill by port
EXISTING=$(lsof -ti tcp:$PORT 2>/dev/null)
if [ -n "$EXISTING" ]; then
  kill -9 $EXISTING 2>/dev/null
  echo "Stopped PID $EXISTING (by port)"
else
  echo "No process found on port $PORT — already stopped."
fi

# Clear log
if [ -f "$LOG" ]; then
  > "$LOG"
  echo "Log cleared: $LOG"
fi

echo "Done."
