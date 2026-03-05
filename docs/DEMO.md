# ESB Demo Script — Phase 1

## What this demo shows
A self-contained Spring Boot + Apache Camel ESB that:
1. Loads routes from YAML at startup (no code changes needed)
2. Validates routes through a 5-layer pipeline (STRUCTURAL → SEMANTIC)
3. Proxies REST calls to SOAP backends (with JSON↔XML transform)
4. Exposes a management API to deploy/hot-reload/remove routes at runtime

## Start the Application

```bash
cd esb-runtime
mvn spring-boot:run -Dspring-boot.run.jvmArguments="-Xms128m -Xmx512m"
```

Expected startup output:
```
RouteAssembler ready — sources=[rest, direct], targets=[http, soap], transforms=[passthrough, jolt], interceptors=3
✓ Route loaded: customer-lookup (customer-lookup.yaml)
✓ Route loaded: order-submit (order-submit.yaml)
Route loading complete — loaded: [customer-lookup, order-submit], failed: []
Started EsbApplication in ~4 seconds
```

---

## Demo Calls (port 9090)

### 1. List live routes
```bash
curl http://localhost:9090/manage/routes
```
Response:
```json
[
  {"name":"customer-lookup","version":"1.0","sourceType":"rest","sourcePath":"/v1/customers/{id}","targetType":"soap","status":"Started"},
  {"name":"order-submit","version":"1.0","sourceType":"rest","sourcePath":"/v1/orders","targetType":"soap","status":"Started"}
]
```

### 2. Customer Lookup — REST → SOAP → JSON transform
```bash
curl -X GET http://localhost:9090/api/v1/customers/CUST001 \
  -H "X-Correlation-ID: demo-001"
```
Response (after Jolt transform extracts from SOAP XML envelope):
```json
{
  "id": "CUST001",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "accountType": "PREMIUM",
  "status": "ACTIVE",
  "creditLimit": "50000.00",
  "meta": {"source": "MOCK_CRM", "retrievedAt": "2025-01-01T12:00:00Z"}
}
```

### 3. Order Submit — Request Jolt normalize + SOAP + Response transform
```bash
curl -X POST http://localhost:9090/api/v1/orders \
  -H "Content-Type: application/json" \
  -H "X-Correlation-ID: demo-002" \
  -d '{
    "orderId": "ORD-001",
    "customerId": "CUST001",
    "amount": 10000,
    "currency": "USD",
    "orderType": "market",
    "side": "BUY",
    "quantity": 100,
    "instrument": "AAPL"
  }'
```
Response:
```json
{
  "orderId": "ORD-2025-001234",
  "status": "ACCEPTED",
  "message": "Order accepted for processing",
  "estimatedCompletion": "2025-01-01T12:05:00Z",
  "source": "esb-finexatech"
}
```

### 4. Validate a YAML spec without deploying
```bash
curl -X POST http://localhost:9090/manage/routes/validate \
  -H "Content-Type: text/plain" \
  -d '
apiVersion: esb/v1
kind: RouteSpec
metadata:
  name: test-route
source:
  type: rest
  method: INVALID_METHOD
  path: /test
target:
  type: soap
  endpointUrl: "http://example.com/service"
'
```
Response shows validation caught the bad HTTP method:
```json
{
  "routeName": "test-route",
  "layerReached": "STRUCTURAL",
  "passed": false,
  "messages": [
    {"severity": "ERROR", "ruleId": "HTTP_METHOD", "field": "source.method",
     "message": "Invalid HTTP method 'INVALID_METHOD'. Must be one of: [GET, POST, PUT, ...]"}
  ]
}
```

### 5. Deploy a new route at runtime (hot-deploy — no restart)
```bash
curl -X POST http://localhost:9090/manage/routes \
  -H "Content-Type: text/plain" \
  -d '
apiVersion: esb/v1
kind: RouteSpec
metadata:
  name: health-check
source:
  type: rest
  method: GET
  path: /v1/health
target:
  type: http
  endpointUrl: "http://httpbin.org/get"
'
```

Then immediately call the new route:
```bash
curl http://localhost:9090/api/v1/health
```

---

## What to highlight to the lead

| Point | What to show |
|-------|-------------|
| YAML-driven | Open `routes/customer-lookup.yaml` — this single file defines the entire route |
| Zero code to add a route | Live-deploy a new route via POST /manage/routes |
| Validation at deploy time | POST /manage/routes/validate with a bad spec |
| Auto transform | JSON in → SOAP XML out → JSON back (Jolt) |
| Correlation ID | Every log line has `[demo-001]` from X-Correlation-ID header |
| Structured logs | Logs show correlationId + routeName MDC context |
| Hot-reload | DELETE then POST /manage/routes without restarting |
| Extensible | Adding a new protocol = one new Java class (adapter) |

---

## Architecture summary (1-slide version)

```
YAML RouteSpec
      │
      ▼
ValidationPipeline ──► L1:Structure ─► L2:Schema ─► L3:Semantic
      │ (passes)
      ▼
RouteAssembler (immutable core — never changes)
      │
      ├── resolves SourceAdapter  (rest → REST DSL)
      ├── resolves TargetAdapter  (soap → HTTP POST + SOAPAction)
      ├── resolves TransformAdapter (jolt → JSON transform)
      └── applies Interceptors (error=10, retry=30, correlation=50)
                    │
                    ▼
          Camel RouteBuilder
                    │
                    ▼
          CamelContext (live routes)
```

---

## Phase 2 — UI (what comes next)

The UI was deliberately left out of Phase 1 to prove the backend
contract first. Phase 2 adds a drag-and-drop UI that outputs the
same RouteSpec YAML the backend already understands.

See `docs/ARCHITECTURE.md` Section 8 for full UI design.
