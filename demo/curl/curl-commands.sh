#!/usr/bin/env bash
# CLI fallback for the live demo — use if the UI has any issues
# Run from git-bash or WSL

RUNTIME=http://localhost:9090

echo "========================================"
echo " ESB Demo — curl fallback commands"
echo "========================================"

# ── STEP 2: Invoke existing REST→SOAP route ──────────────────────────
demo_balance() {
  echo ""
  echo "[STEP 2] REST → SOAP account balance"
  curl -s -X GET \
    -H "X-Correlation-ID: demo-$(date +%s)" \
    "$RUNTIME/api/v1/accounts/ACC001/balance" | python -m json.tool 2>/dev/null || \
  curl -s -X GET -H "X-Correlation-ID: demo-$(date +%s)" \
    "$RUNTIME/api/v1/accounts/ACC001/balance"
}

# ── STEP 3: Audit log ────────────────────────────────────────────────
demo_audit() {
  echo ""
  echo "[STEP 4] Audit log (last 10 events)"
  curl -s "$RUNTIME/manage/audit?limit=10" | python -m json.tool 2>/dev/null || \
  curl -s "$RUNTIME/manage/audit?limit=10"
}

# ── STEP 4: Stop/Start route ─────────────────────────────────────────
demo_stop() {
  echo ""
  echo "[STEP 5] Suspending account-balance route..."
  curl -s -X POST "$RUNTIME/manage/routes/account-balance/stop"
  echo ""
  echo "Invoking (expect 503)..."
  curl -s -X GET "$RUNTIME/api/v1/accounts/ACC001/balance"
}

demo_start() {
  echo ""
  echo "[STEP 5] Resuming account-balance route..."
  curl -s -X POST "$RUNTIME/manage/routes/account-balance/start"
  echo ""
  echo "Invoking (expect 200)..."
  curl -s -X GET "$RUNTIME/api/v1/accounts/ACC001/balance"
}

# ── STEP 6: Health ───────────────────────────────────────────────────
demo_health() {
  echo ""
  echo "[STEP 8] Health endpoint"
  curl -s "$RUNTIME/manage/health" | python -m json.tool 2>/dev/null || \
  curl -s "$RUNTIME/manage/health"
}

# ── STEP 7: Components ───────────────────────────────────────────────
demo_palette() {
  echo ""
  echo "[STEP 7] Registered adapter components"
  curl -s "$RUNTIME/manage/components" | python -m json.tool 2>/dev/null || \
  curl -s "$RUNTIME/manage/components"
}

# Run all in sequence if called without args
if [[ $# -eq 0 ]]; then
  demo_balance
  sleep 1
  demo_balance
  sleep 1
  demo_balance
  demo_audit
  demo_stop
  sleep 2
  demo_start
  demo_health
  demo_palette
else
  "$@"
fi
