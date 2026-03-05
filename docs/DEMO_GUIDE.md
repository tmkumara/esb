# FineXaTech ESB Platform — Demo Guide

> **Stack:** Apache Camel 4.7.x · Spring Boot 3.3.x · React 18 + Vite
> **Ports:** Backend `9090` · UI `3000`
> **Scenario:** Mobile App → ESB → Legacy SOAP Banking Service

---

## 1. Architecture at a Glance

```
┌──────────────────────────────────────────────────────────────────────┐
│                        FineXaTech ESB Platform                       │
│                                                                       │
│  ┌──────────┐    ┌──────────────────────────────────────────────┐    │
│  │          │    │              ESB Runtime (port 9090)          │    │
│  │  Mobile  │    │                                              │    │
│  │   App    │───▶│  REST Source → [Transform] → Target          │    │
│  │  / API   │    │                                              │    │
│  │  Client  │◀───│  Response ← [Transform] ← Target Response   │    │
│  └──────────┘    └──────────────────────────────────────────────┘    │
│                          │                    │                       │
│                    ┌─────▼──────┐    ┌────────▼──────┐              │
│                    │   Mock     │    │  Real SOAP /  │              │
│                    │ Response   │    │  REST Backend │              │
│                    │  (YAML)    │    │   Service     │              │
│                    └────────────┘    └───────────────┘              │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐     │
│  │                   ESB UI (port 3000)                         │     │
│  │   Routes | Builder | Validation | Monitoring                │     │
│  └─────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Module Map

| Module | Role | Key Classes |
|--------|------|-------------|
| `esb-spec` | YAML contract POJOs | `RouteSpec`, `TargetSpec`, `TransformSpec` |
| `esb-compiler` | Validation + Assembly | `ValidationPipeline`, `RouteAssembler` |
| `esb-adapters` | Protocol implementations | `RestSourceAdapter`, `SoapTargetAdapter`, `GroovyTransformAdapter`, `MockResponseTargetAdapter` |
| `esb-runtime` | Spring Boot app | `LiveRouteRegistry`, `HotReloadWatcher`, `RouteManagementController` |
| `esb-ui` | React dashboard | `RouteBuilderPage`, `RoutesPage`, `ValidationPage` |

---

## 3. Demo Scenario — REST → SOAP Account Balance

### 3.1 What we are building

```
Mobile Client                    ESB                        Bank SOAP Service
     │                            │                               │
     │  GET /api/v1/accounts/     │                               │
     │  12345/balance  ──────────▶│                               │
     │  (clean REST, no SOAP)     │  Groovy: build SOAP XML       │
     │                            │  POST /mock/soap/balance ────▶│
     │                            │                               │ Returns SOAP XML
     │                            │◀───── SOAP XML response ──────│
     │                            │  Auto: SOAP XML → JSON        │
     │                            │  Jolt: unwrap wrapper key     │
     │◀── Clean JSON ─────────────│                               │
     │  {"accountNumber":"12345"} │                               │
```

### 3.2 Routes to deploy

| Route Name | Purpose | Source | Target |
|-----------|---------|--------|--------|
| `mock-balance-service` | Simulates SOAP backend | POST `/mock/soap/balance-service` | mock-response (SOAP XML) |
| `account-balance` | Client-facing ESB API | GET `/v1/accounts/{accountId}/balance` | soap → mock service |

---

## 4. Step-by-Step Demo

### Step 1 — Start the platform

```bash
# Terminal 1 — Backend
cd esb-runtime
mvn spring-boot:run
# Wait for: "Started EsbRuntimeApplication"

# Terminal 2 — Frontend
cd esb-ui
npm run dev
# Open: http://localhost:3000
```

### Step 2 — Build mock-balance-service route

1. Open **Builder** tab
2. Set route name: `mock-balance-service`
3. Drag **REST Source** → Method: `POST`, Path: `/mock/soap/balance-service`
4. Drag **Mock Response** target → Status: `200`, paste body:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetAccountBalanceResponse xmlns="http://bank.com/core">
      <accountNumber>12345</accountNumber>
      <accountHolder>John Smith</accountHolder>
      <balance>2500.75</balance>
      <currency>USD</currency>
    </GetAccountBalanceResponse>
  </soap:Body>
</soap:Envelope>
```

5. Connect Source → Mock Response
6. **Validate** → **Deploy** → **Save to Disk**

### Step 3 — Build account-balance ESB route

1. Set route name: `account-balance`
2. Drag **REST Source** → Method: `GET`, Path: `/v1/accounts/{accountId}/balance`
3. Drag **Req Transform** → Role: `Request`, Type: `groovy`
4. Click **Script Editor**, add to Sample Headers: `{"accountId": "12345"}`
5. Paste Groovy script:

```groovy
"""<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:bank="http://bank.com/core"><soapenv:Header/><soapenv:Body><bank:GetAccountBalanceRequest><bank:accountNumber>${headers['accountId'] ?: 'UNKNOWN'}</bank:accountNumber></bank:GetAccountBalanceRequest></soapenv:Body></soapenv:Envelope>"""
```

6. Click **Preview Output** → verify SOAP XML is generated with `12345`
7. Click **Save**
8. Drag **SOAP Target** → URL: `http://localhost:9090/mock/soap/balance-service`, Timeout: `5000`
9. *(Optional)* Drag **Res Transform** → Type: `jolt`, spec:

```json
[{"operation":"shift","spec":{"GetAccountBalanceResponse":{"*":"&"}}}]
```

10. Connect: REST Source → Req Transform → SOAP Target → Res Transform
11. **Validate** → **Deploy** → **Save to Disk**

### Step 4 — Verify routes are live

Go to **Routes** page — you should see both routes as `● Started`.

### Step 5 — Test end-to-end

**PowerShell:**
```powershell
Invoke-RestMethod -Uri "http://localhost:9090/api/v1/accounts/12345/balance" -Method GET
```

**Expected response:**
```json
{
  "accountNumber": "12345",
  "accountHolder": "John Smith",
  "balance": "2500.75",
  "currency": "USD"
}
```

**Try different IDs:**
```powershell
Invoke-RestMethod -Uri "http://localhost:9090/api/v1/accounts/99999/balance" -Method GET
Invoke-RestMethod -Uri "http://localhost:9090/api/v1/accounts/ABC-001/balance" -Method GET
```

---

## 5. Complete YAML Reference

### mock-balance-service.yaml
```yaml
apiVersion: esb/v1
kind: Route
metadata:
  name: mock-balance-service
source:
  type: rest
  method: POST
  path: /mock/soap/balance-service
target:
  type: mock-response
  mockStatusCode: 200
  mockBody: |
    <?xml version="1.0" encoding="UTF-8"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <GetAccountBalanceResponse xmlns="http://bank.com/core">
          <accountNumber>12345</accountNumber>
          <accountHolder>John Smith</accountHolder>
          <balance>2500.75</balance>
          <currency>USD</currency>
        </GetAccountBalanceResponse>
      </soap:Body>
    </soap:Envelope>
interceptors:
  - type: correlation
```

### account-balance.yaml
```yaml
apiVersion: esb/v1
kind: Route
metadata:
  name: account-balance
source:
  type: rest
  method: GET
  path: /v1/accounts/{accountId}/balance
transform:
  request:
    type: groovy
    inline: |
      """<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:bank="http://bank.com/core"><soapenv:Header/><soapenv:Body><bank:GetAccountBalanceRequest><bank:accountNumber>${headers['accountId'] ?: 'UNKNOWN'}</bank:accountNumber></bank:GetAccountBalanceRequest></soapenv:Body></soapenv:Envelope>"""
  response:
    type: jolt
    inline: '[{"operation":"shift","spec":{"GetAccountBalanceResponse":{"*":"&"}}}]'
target:
  type: soap
  endpointUrl: http://localhost:9090/mock/soap/balance-service
  timeout:
    readMs: 5000
interceptors:
  - type: correlation
  - type: retry
    config:
      maxAttempts: 3
```

---

## 6. Route Persistence

| Action | Where saved | Survives restart? |
|--------|-------------|------------------|
| Deploy Route (UI) | In-memory only | ✗ |
| Save to Disk (UI) | `<project>/esb-runtime/routes/*.yaml` | ✓ |
| HotReloadWatcher | Auto-loads from routes dir on startup | ✓ |

**Routes directory:** `D:\FineXaTech\POC\esb\esb-runtime\routes\`

---

## 7. Key Issues Found & Resolved

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| YAML TAB error | Groovy inline block had TAB chars | Use `\|` block literal with spaces only |
| `No such property: id` | `def id` in Groovy = local var, not accessible in GString property lookup | Inline expression directly: `${headers['accountId']}` |
| Path doubling (404) | Camel HTTP appends source path to target URL | Remove `HTTP_PATH`, `HTTP_URI`, `HTTP_QUERY` headers in preProcessor |
| Transforms showing "none" | `RouteStatusView` had no transform fields | Added `requestTransformType`, `responseTransformType` to record |
| ValidationPage crash | Backend returns `{messages[]}`, UI expects `{layers[]}` | Added `normalizeValidationResponse()` in ValidationPage |
| `endpointUrl required` for mock-response | `RequiredFieldsRule` always checked endpointUrl | Skip check for `mock-response` and `mock-echo` types |
| Groovy preview `headers` error | `TransformPreviewService` only injected `body` | Added `headers` map injection + Sample Headers UI input |

---

## 8. How to Add a New Integration

### New target adapter (e.g. gRPC)

```java
// 1. esb-adapters — new @Component
@Component
public class GrpcTargetAdapter implements TargetAdapter {
    @Override public String protocol() { return "grpc"; }
    @Override public String buildToUri(TargetSpec spec) { return "grpc://..."; }
}
// 2. Restart backend → palette auto-updates
// 3. Add to TARGET_METADATA in RouteBuilderPage.tsx
```

### New mock endpoint (zero code)

1. In Builder → drag REST Source (your mock URL) + Mock Response target
2. Paste static response body (JSON or SOAP XML)
3. Deploy → Save to Disk
4. Done — no Java code needed

### Add response transform to any route

1. Routes page → Edit route
2. Drag **Res Transform** node
3. Choose Jolt (JSON→JSON) or Groovy
4. Connect Target → Res Transform
5. Deploy → Save to Disk

---

## 9. Management API Quick Reference

```powershell
# List all live routes
Invoke-RestMethod http://localhost:9090/manage/routes

# Get one route spec
Invoke-RestMethod http://localhost:9090/manage/routes/account-balance

# Health check
Invoke-RestMethod http://localhost:9090/manage/health

# Reload a route (hot-reload, no restart)
Invoke-RestMethod -Uri http://localhost:9090/manage/routes/account-balance/reload -Method PUT

# Delete a route
Invoke-RestMethod -Uri http://localhost:9090/manage/routes/account-balance -Method DELETE
```
