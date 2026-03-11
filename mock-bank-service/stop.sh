#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Mock Bank SOAP Service — stop script (Linux / macOS)
# ─────────────────────────────────────────────────────────────

PORT="${1:-8085}"
LOG="mock-bank.log"

echo "Stopping Mock Bank SOAP Service on port $PORT..."

PID=$(lsof -ti tcp:$PORT 2>/dev/null)

if [ -z "$PID" ]; then
  echo "No process found on port $PORT — already stopped."
else
  kill -9 $PID 2>/dev/null
  echo "Stopped PID $PID"
fi

# Clear log
if [ -f "$LOG" ]; then
  > "$LOG"
  echo "Log cleared: $LOG"
fi

echo "Done."
