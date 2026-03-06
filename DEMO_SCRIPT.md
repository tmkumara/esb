# ESB Platform Demo Script — 8 Minutes

**Audience:** Technical lead
**Goal:** Show the platform is production-grade, extensible, and observable

---

## Pre-flight checklist (before the meeting)

- [ ] Run `start-demo.bat` (or `start-demo.sh`) — all 3 services green
- [ ] Open http://localhost:3000 in browser
- [ ] Open a terminal with `demo/curl/curl-commands.sh` ready
- [ ] Have `HttpLoggedTargetAdapter.java` open in your editor
- [ ] Confirm `account-balance` route shows **Started** (green) in Routes page

---

## STEP 1 — START (30 s)

> _"This is a fintech ESB built on Apache Camel and Spring Boot.
> One command starts the runtime, the designer, and the management UI."_

- Run `start-demo.bat`
- Open http://localhost:3000 → Dashboard page

---

## STEP 2 — EXISTING REST→SOAP ROUTE (1 min)

- Navigate to **Routes** → show `account-balance` route (green badge, `Started`)
- Split terminal beside browser, run:

```bash
curl -s -H "X-Correlation-ID: DEMO-001" \
  http://localhost:9090/api/v1/accounts/ACC001/balance
```

- Show JSON response: `accountNumber`, `balance`, `currency`
- Point at terminal log: every line has `[correlationId=DEMO-001]` and `[routeName=account-balance]`

> _"Every message is traceable end-to-end. Ops never asks 'which request failed?' — they look up the correlation ID."_

---

## STEP 3 — DESIGNER: UI GENERATES YAML (1.5 min)

- Navigate to **Builder**
- Drag: `REST Source` → `Jolt Transform` → `SOAP Target`
- Point at YAML panel updating in real time

> _"Developer draws the flow. Platform generates the integration config."_

- Click **Validate** → show all 5 layers: STRUCTURAL ✓ SCHEMA ✓ SEMANTIC ✓ COMPATIBILITY ✓ DRY_RUN ✓
- Click **Deploy** → route appears in Monitor immediately (no restart)

---

## STEP 4 — AUDIT PAGE (1 min)

- Navigate to **Audit**
- Make 3 API calls (use curl or browser)
- Show table: `correlationId | route | GET | /api/v1/... | 200 | 43ms | 14:02:31`

> _"Every message is recorded. Immutable audit trail. Auto-refreshes every 3 seconds."_

---

## STEP 5 — STOP/START FROM UI (30 s)

- On Routes page: click **Stop** next to `account-balance` → badge turns grey (`Suspended`)
- Run: `curl http://localhost:9090/api/v1/accounts/ACC001/balance` → error (route paused)
- Click **Start** → badge turns green (`Started`)
- Run curl again → 200 OK

> _"Route operations are instant — no restart, no downtime for other routes."_

---

## STEP 6 — VALIDATION FAILURE (30 s)

- Go to **Validation** tab
- Paste a broken YAML (delete the `name:` field under `metadata`)
- Click **Validate**
- Show error: `STRUCTURAL layer — routeName is required`
- Fix it → re-validate → all layers green

> _"The platform rejects bad config before it ever touches the runtime.
> Five validation layers catch structural errors, schema violations, semantic issues, and incompatible specs."_

---

## STEP 7 — ADD NEW COMPONENT LIVE (2 min)

- Show **Builder** → Targets palette: `soap`, `http`, `mock-response`, `mock-echo`

> _"Four targets right now. Let me add a fifth — live."_

- Open `HttpLoggedTargetAdapter.java` in editor
- Walk through the 4 methods (see `demo/new-component/README.md`)
- Restart only the runtime (15 s)
- Refresh UI palette → `http-logged` appears

> _"No UI changes. No config file. No annotation processor. Just `@Component`.
> The Spring container discovers it and the palette updates automatically."_

- Drag `http-logged` into a route → deploy → invoke → show `[DEMO] →` and `[DEMO] ←` log lines

---

## STEP 8 — MONITORING (30 s)

```bash
# All live routes with status
curl http://localhost:9090/manage/routes

# System health (for Grafana / k8s probe)
curl http://localhost:9090/manage/health

# What adapters are loaded right now
curl http://localhost:9090/manage/components
```

> _"This is the operational API your ops team integrates with Grafana or Datadog.
> In Kubernetes each broker namespace — Saudi, Kuwait, dev — runs its own runtime
> with isolated routes dropped via PVC mount. Zero central coordinator needed."_

---

## Fallback

If the UI has any issue, use `demo/curl/curl-commands.sh`:

```bash
bash demo/curl/curl-commands.sh          # runs full demo sequence
bash demo/curl/curl-commands.sh demo_audit   # just audit log
```
