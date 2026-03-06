# Route Release Guide — Delivering a New Integration to a Client

> **Audience:** Integration developer handing a live route to an end client.
> **Tooling:** ESB Designer (port 9191) · ESB Runtime (port 9090) · ESB UI (port 3000)
> **Working example used throughout:** `GET /api/v1/accounts/{accountId}/balance` (REST → SOAP)

---

## Prerequisites

Both services must be running before you start.

```
IntelliJ → Run "ESB Full Stack"
  ├── ESB Runtime  → http://localhost:9090  (live Camel routes)
  ├── ESB Designer → http://localhost:9191  (validate, preview, save)
  └── ESB UI       → http://localhost:3000  (browser — designer mode)
```

Confirm both are healthy:

```bash
curl http://localhost:9090/manage/health   # → {"status":"UP",...}
curl http://localhost:9191/manage/components  # → {"sources":[...],"targets":[...],"transforms":[...]}
```

---

## Step 1 — Define the Integration Contract

Before touching the UI, agree on these four things with the client:

| Item | Example |
|------|---------|
| **Client-facing endpoint** | `GET /api/v1/accounts/{accountId}/balance` |
| **Backend system** | Legacy SOAP service at `http://core-banking:8080/soap/balance` |
| **Request transform** | Build SOAP envelope from path parameter |
| **Response transform** | Flatten SOAP XML → clean JSON |

Write this down. The YAML route spec is the formal contract — nothing gets deployed without it.

---

## Step 2 — Author the Route in the Designer UI

Open `http://localhost:3000` (designer mode).

### 2a. Open Route Builder

Navigate to **Builder** in the top nav.

### 2b. Build the canvas

1. **Drag a Source node** from the palette onto the canvas.
   - Type: `rest`
   - Method: `GET`
   - Path: `/v1/accounts/{accountId}/balance`

2. **Drag a Request Transform node** between source and target.
   - Type: `groovy`
   - Script: builds the SOAP envelope using `${headers['accountId']}`

3. **Drag a Target node** onto the canvas.
   - Type: `soap`
   - Endpoint URL: `http://core-banking:8080/soap/balance`

4. **Drag a Response Transform node** after the target.
   - Type: `jolt`
   - Spec: flatten/rename the SOAP XML response fields

5. **Connect** all nodes left-to-right on the canvas.

### 2c. Set the route name

In the top-right of the Builder panel, set **Route Name** (e.g. `account-balance`).
This becomes the filename on disk and the live route ID — choose it once and don't change it.

### 2d. Preview transforms before saving

For each transform node, click **Edit** to open the editor:

- **Groovy request** — use the **Preview** tab, paste a sample header `{"accountId": "12345"}` and verify the SOAP XML output looks correct.
- **Jolt response** — paste sample SOAP XML and verify the JSON output is what the client expects.

Only proceed when both previews produce correct output.

---

## Step 3 — Validate the Route

Navigate to **Validation** in the top nav.

1. Click **Export YAML** in the Builder (or copy the YAML panel).
2. Paste the YAML into the Validation page text area.
3. Click **Validate**.

The pipeline runs five layers:

| Layer | What it checks |
|-------|---------------|
| STRUCTURAL | Required fields present, types correct |
| SCHEMA | Values are valid (method, path format, known adapter types) |
| SEMANTIC | Cross-field logic (endpoint URL reachable format, path params match headers) |

**All layers must show green before you proceed.**

If any layer fails, go back to the Builder, fix the highlighted issue, and re-validate.

---

## Step 4 — Save the Route to Disk

In the Builder, click **Save to Disk** (or call the API directly):

```bash
curl -X POST http://localhost:9191/manage/routes/save \
  -H "Content-Type: text/plain" \
  --data-binary @account-balance.yaml
```

What happens next (automatic):
1. Designer validates the YAML one final time.
2. Designer writes `esb-runtime/routes/account-balance.yaml`.
3. Runtime's `HotReloadWatcher` detects the new file within ~300 ms.
4. Runtime parses → validates → assembles → starts the live Camel route.

No restart required.

---

## Step 5 — Confirm the Route is Live

```bash
# List all live routes
curl http://localhost:9090/manage/routes

# Check this specific route
curl http://localhost:9090/manage/routes/account-balance
```

Expected response includes:

```json
{
  "name": "account-balance",
  "status": "Started",
  "sourceType": "rest",
  "sourcePath": "/v1/accounts/{accountId}/balance",
  "targetType": "soap"
}
```

If `status` is not `Started`, check the runtime logs:

```
# IntelliJ Services panel → ESB Runtime tab
# Look for: HotReloadWatcher [file-create]: ✓ route 'account-balance' loaded
# Or error: ✗ route 'account-balance' failed validation
```

---

## Step 6 — Smoke Test the Live Endpoint

Hit the actual client-facing URL through the runtime:

```bash
# Basic call
curl -v "http://localhost:9090/api/v1/accounts/12345/balance"

# Expected: HTTP 200 with JSON body
# {
#   "accountNumber": "12345",
#   "accountHolder": "John Smith",
#   "balance": 150000.00,
#   "currency": "USD"
# }
```

Check for common failure patterns:

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| HTTP 404 on `/api/...` | Path in YAML starts with `/api` | Remove `/api` prefix — Camel adds it automatically |
| HTTP 404 on the target | Path doubling in SOAP target | Ensure `SoapTargetAdapter` removes `HTTP_PATH` header |
| Empty/wrong JSON | Jolt spec incorrect | Re-run Jolt preview in the Designer with the actual response XML |
| SOAP 500 | Envelope namespace wrong | Check Groovy script output in the preview tab |

---

## Step 7 — Prepare Client Handoff Documentation

Create a one-page API spec for the client. Template:

```
INTEGRATION: Account Balance
Delivered by: FineXaTech ESB Platform
Date: YYYY-MM-DD
Version: 1.0

── ENDPOINT ──────────────────────────────────────────────────────
Method:   GET
URL:      http://<esb-host>:<port>/api/v1/accounts/{accountId}/balance
Auth:     [Bearer token | API Key | None] — header: Authorization

── PATH PARAMETERS ───────────────────────────────────────────────
accountId   string   required   Customer account number

── RESPONSE ──────────────────────────────────────────────────────
HTTP 200 — Success
{
  "accountNumber": "string",
  "accountHolder": "string",
  "balance":       number,
  "currency":      "string"   // ISO 4217, e.g. "USD"
}

HTTP 503 — Backend SOAP service unavailable (Camel circuit open)
HTTP 504 — Backend timeout (readMs: 30000)
HTTP 500 — Unexpected error (correlationId in X-Correlation-ID header for trace)

── BACKEND ───────────────────────────────────────────────────────
Routes through: FineXaTech ESB (Apache Camel 4.7)
Target: SOAP GetAccountBalanceRequest / GetAccountBalanceResponse

── TESTING ───────────────────────────────────────────────────────
curl "http://<esb-host>/api/v1/accounts/12345/balance"
```

Save this as `delivery/<route-name>-api-spec.md` (or convert to PDF for formal handoff).

---

## Step 8 — Verify Persistence Survives Restart

The route YAML is already on disk (`esb-runtime/routes/account-balance.yaml`).
Verify it auto-loads on the next restart:

```bash
# Stop the runtime (IntelliJ → Stop button on ESB Runtime)
# Start it again
# Within seconds of startup, check:

curl http://localhost:9090/manage/routes/account-balance
# Must return "status": "Started" — no manual intervention needed
```

If the route does NOT appear after restart, check:
- `esb-runtime/routes/account-balance.yaml` exists on disk
- `application.yaml` `esb.routes.store-dir` points to the `routes/` folder
- YAML is valid (re-validate in the Designer)

---

## Step 9 — Set Up Monitoring (Optional but recommended)

Point the client (or ops team) to the **Monitoring** page in the UI:

```
http://localhost:3000/monitoring
```

In runtime mode (`npm run dev:runtime`), this is the ONLY page visible — suitable for an ops dashboard.

Key metrics available:

| Metric | How to check |
|--------|-------------|
| Route up/down | `GET /manage/health` → `status: UP / DEGRADED` |
| All live routes | `GET /manage/routes` → `status` field per route |
| Prometheus scrape | `GET /actuator/prometheus` → `camel_*` metrics |
| Route-level throughput | `camel_exchanges_total` counter in Prometheus |
| Error rate | `camel_exchanges_failed_total` |

To reload a misbehaving route without restart:

```bash
curl -X PUT http://localhost:9090/manage/routes/account-balance/reload
```

---

## Step 10 — Post-Release Checklist

```
□ Route is live:         GET /manage/routes/{name} → "status": "Started"
□ Smoke test passed:     real HTTP call returns correct JSON
□ YAML on disk:          esb-runtime/routes/{name}.yaml exists
□ Restart verified:      route reloads automatically on startup
□ Client doc delivered:  API spec sent (endpoint, params, error codes)
□ Monitoring confirmed:  ops team knows the health URL and Prometheus endpoint
□ Transform previews:    screenshots or logs saved for audit trail
```

---

## Quick Reference — All Relevant API Calls

```bash
# ── Designer (port 9191) ────────────────────────────────────────
# Validate without deploying
curl -X POST http://localhost:9191/manage/routes/validate \
  -H "Content-Type: text/plain" --data-binary @route.yaml

# Save YAML to disk (runtime picks it up automatically)
curl -X POST http://localhost:9191/manage/routes/save \
  -H "Content-Type: text/plain" --data-binary @route.yaml

# List saved YAML files
curl http://localhost:9191/manage/routes

# List available adapter types
curl http://localhost:9191/manage/components

# Preview a Jolt transform
curl -X POST http://localhost:9191/manage/transforms/preview \
  -H "Content-Type: application/json" \
  -d '{"type":"jolt","spec":"[{\"operation\":\"shift\",...}]","input":"{\"key\":\"val\"}"}'

# ── Runtime (port 9090) ─────────────────────────────────────────
# Health
curl http://localhost:9090/manage/health

# All live routes
curl http://localhost:9090/manage/routes

# One route detail
curl http://localhost:9090/manage/routes/{name}

# Deploy from YAML body (in-memory — does NOT write to disk)
curl -X POST http://localhost:9090/manage/routes \
  -H "Content-Type: text/plain" --data-binary @route.yaml

# Hot-reload a route
curl -X PUT http://localhost:9090/manage/routes/{name}/reload

# Stop + remove a route
curl -X DELETE http://localhost:9090/manage/routes/{name}

# ── Live endpoint ───────────────────────────────────────────────
curl http://localhost:9090/api/v1/accounts/12345/balance
```

---

## Common Mistakes

| Mistake | Result | Fix |
|---------|--------|-----|
| Path starts with `/api` in YAML | 404 — Camel maps to `/api/api/...` | Remove `/api` from `source.path` |
| Deployed via `POST /manage/routes` only | Route gone after restart | Always use **Save to Disk** or Designer save |
| YAML edited manually without re-validating | Silent runtime errors | Re-run Designer validation after any edit |
| Wrong `routes-output-dir` in Designer | YAML saved to wrong folder | Check `-Desb.designer.routes-output-dir` VM param in IntelliJ |
| Target URL has trailing slash conflict | 404 on SOAP target | `SoapTargetAdapter` strips path headers — ensure `bridgeEndpoint=true` |
