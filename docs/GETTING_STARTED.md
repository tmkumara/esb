# FineXa ESB — Getting Started Guide

> Covers: starting the stack, building a route (UI + YAML), deploying routes at runtime, hot-reload file watcher, multi-broker deployment, and adding new Camel components.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Start the Stack](#2-start-the-stack)
3. [Build a Route — UI (Drag & Drop)](#3-build-a-route--ui-drag--drop)
4. [Build a Route — YAML Direct](#4-build-a-route--yaml-direct)
5. [Test Your Route](#5-test-your-route)
6. [Validate & Debug](#6-validate--debug)
7. [Find Deployed Routes at Runtime](#7-find-deployed-routes-at-runtime)
8. [Deploy Routes at Runtime (No Restart)](#8-deploy-routes-at-runtime-no-restart)
9. [Hot-Reload File Watcher](#9-hot-reload-file-watcher)
10. [Multi-Broker Deployment](#10-multi-broker-deployment)
11. [Add a New Camel Component](#11-add-a-new-camel-component)

---

## 1. Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Java | 21+ | `java -version` |
| Maven | 3.9+ | `mvn -version` |
| Node.js | 18+ | `node -version` |
| npm | 9+ | `npm -version` |

---

## 2. Start the Stack

### Terminal 1 — Backend (Spring Boot + Camel)

```bash
cd D:\FineXaTech\POC\esb
mvn spring-boot:run -pl esb-runtime
```

**Wait for this line:**
```
Started EsbApplication in X.XXX seconds
```

What starts on **port 9090**:

| Path | Purpose |
|------|---------|
| `GET  /manage/health` | Health check |
| `GET  /manage/routes` | List all live routes |
| `POST /manage/routes` | Deploy a route (YAML body) |
| `POST /manage/routes/validate` | Validate YAML without deploying |
| `PUT  /manage/routes/{name}/reload` | Hot-reload a route |
| `DEL  /manage/routes/{name}` | Remove a route |
| `/api/**` | All business routes (Camel servlet) |
| `POST /mock/soap/customer-service` | Built-in mock SOAP server (demo profile) |
| `POST /mock/soap/order-service` | Built-in mock SOAP server (demo profile) |

> **Note:** The mock SOAP server runs inside the same app (`demo` Spring profile, active by default).
> No separate SOAP server needed for local testing.

---

### Terminal 2 — Frontend (React + Vite)

```bash
cd D:\FineXaTech\POC\esb\esb-ui
npm install        # first time only
npm run dev -- --port 3000
```

Open browser → **http://localhost:3000**

> The Vite dev server proxies `/manage/*` and `/api/*` to `localhost:9090` automatically.
> All API calls use relative URLs — no CORS issues.

---

### Quick health check

```bash
curl http://localhost:9090/manage/health
```

Expected:
```json
{
  "status": "UP",
  "totalRoutes": 2,
  "activeRoutes": 2,
  "routes": [
    { "name": "customer-lookup", "status": "Started" },
    { "name": "order-submit",    "status": "Started" }
  ]
}
```

---

## 3. Build a Route — UI (Drag & Drop)

### Example: REST GET → SOAP (Customer Lookup)

**Step 1 — Open Builder**

Go to **http://localhost:3000** → click **BUILDER** tab in the nav bar.

---

**Step 2 — Set the route name**

In the top action bar, type a route name:
```
customer-lookup
```

---

**Step 3 — Add a REST Source**

From the left palette → **Sources** → drag **"REST Source"** onto the canvas.

Click the node → in the right **Properties** panel:
- **Method:** `GET`
- **Path:** `/v1/customers/{id}`

---

**Step 4 — Add a SOAP Target**

Palette → **Targets** → drag **"SOAP Target"** onto the canvas (place it to the right of source).

Click it → Properties:
- **Endpoint URL:** `http://localhost:9090/mock/soap/customer-service`
- **Operation:** `GetCustomer`
- **Timeout:** `30000`

---

**Step 5 — Connect them**

Hover over the **right edge** of the Source node until a blue dot appears.
Drag to the **left edge** of the SOAP Target node.

---

**Step 6 — Add interceptors** *(optional but recommended)*

Palette → **Interceptors** → drag **"Correlation"** onto the canvas.
Palette → **Interceptors** → drag **"Retry"** → Properties → Max Attempts: `3`

---

**Step 7 — Preview YAML**

Click **`YAML`** in the action bar. The generated spec appears at the bottom:

```yaml
apiVersion: esb/v1
kind: Route
metadata:
  name: customer-lookup
source:
  type: rest
  method: GET
  path: /v1/customers/{id}
target:
  type: soap
  endpointUrl: http://localhost:9090/mock/soap/customer-service
  operation: GetCustomer
  timeout: 30000
interceptors:
  - type: correlation
  - type: retry
    config:
      maxAttempts: 3
```

---

**Step 8 — Validate**

Click **`Validate`** → toast shows ✅ `Validation passed`

If it shows a warning instead, go to the **VALIDATION** page (see section 6).

---

**Step 9 — Deploy**

Click **`Deploy`** → toast shows ✅ `"customer-lookup" is now active`

Go to **ROUTES** tab → see the route with status **Started**.

---

## 4. Build a Route — YAML Direct

Use this when you prefer to write YAML manually or deploy from CI/CD.

### Full RouteSpec reference

```yaml
apiVersion: esb/v1
kind: Route

metadata:
  name: my-route                   # unique route ID (kebab-case)

source:
  type: rest                       # rest | direct | kafka | jms | file | timer
  method: POST                     # GET | POST | PUT | DELETE | PATCH
  path: /v1/resource               # URL path — do NOT include /api prefix

target:
  type: soap                       # soap | http | jms | kafka | jdbc
  endpointUrl: http://host/service # full URL to the downstream service
  operation: doOperation           # SOAP operation name (soap type only)
  timeout: 30000                   # ms

transform:
  request:
    type: passthrough              # passthrough | jolt | xslt
  response:
    type: jolt
    spec:                          # inline Jolt spec (optional)
      operation: shift

interceptors:
  - type: correlation              # assigns X-Correlation-ID
  - type: retry
    config:
      maxAttempts: 3
  - type: auth                     # JWT / API key validation
  - type: metrics                  # Micrometer counters + timers
  - type: timeout
    config:
      timeoutMs: 10000
```

### Deploy via UI (Routes page)

1. Go to **ROUTES** tab → click **Deploy Route**
2. Paste your YAML into the editor
3. Click **Deploy Route**

### Deploy via curl

```bash
curl -X POST http://localhost:9090/manage/routes \
  -H "Content-Type: text/plain" \
  --data-binary @my-route.yaml
```

### Deploy from file at startup

Drop the YAML file into:
```
esb-runtime/src/main/resources/routes/my-route.yaml
```
The route loads automatically on next app start (hot-reload also picks it up).

---

## 5. Test Your Route

Once deployed, business routes are available at `http://localhost:9090/api/{path}`.

### REST → SOAP (customer lookup)

```bash
curl -X GET http://localhost:9090/api/v1/customers/123 \
  -H "Accept: application/json"
```

Expected JSON response (SOAP XML converted by ESB):
```json
{
  "id": "CUST001",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "accountType": "PREMIUM",
  "status": "ACTIVE",
  "creditLimit": 50000.00
}
```

### REST → HTTP (order submit)

```bash
curl -X POST http://localhost:9090/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{"productId": "PROD001", "qty": 2}'
```

### What happens inside the ESB

```
curl → /api/v1/customers/123
          ↓
  Camel REST Servlet  (matches route: GET /v1/customers/{id})
          ↓
  CorrelationInterceptor  →  assigns X-Correlation-ID header
          ↓
  RetryInterceptor        →  wraps call with retry policy
          ↓
  SoapTargetAdapter       →  builds SOAP envelope, POST → /mock/soap/customer-service
          ↓
  MockSoapController      →  returns SOAP XML
          ↓
  Jolt/Passthrough Transform  →  strips SOAP wrapper → clean JSON
          ↓
  200 OK  →  JSON back to caller
```

---

## 6. Validate & Debug

### UI Validation (5-layer pipeline)

Go to **VALIDATION** tab → paste YAML → click **Run Validation**.

Results show each layer:

| Layer | What it checks |
|-------|---------------|
| `STRUCTURAL` | Required fields present, YAML parses correctly |
| `SCHEMA` | Field types, valid enum values (method, type, etc.) |
| `SEMANTIC` | Path format, URL format, transform spec validity |
| `COMPATIBILITY` | Source ↔ Target type combination is supported |
| `DRY_RUN` | Isolated Camel context spins up with mock components |

A route must pass **all 5 layers** before it can be deployed.

### Common errors

| Error | Cause | Fix |
|-------|-------|-----|
| `source.path must not include /api prefix` | Path written as `/api/v1/...` | Use `/v1/...` |
| `Unsupported source type: kafka` | T1 adapter not yet implemented | Use `rest` or `direct` for now |
| `endpointUrl is required for soap target` | Missing URL field | Add `endpointUrl:` |
| `STRUCTURAL FAIL — missing metadata.name` | No name in YAML | Add `metadata: name: my-route` |
| `Network error` on validate/deploy | CORS / backend not running | Check backend is on :9090 |

### Monitoring live traffic

Go to **MONITORING** tab → use filters:
- **Level** dropdown → filter `ERROR` or `WARN` only
- **Route** dropdown → focus on one route
- **Auto-Refresh** toggle → live log stream every 2.5s

---

## 7. Find Deployed Routes at Runtime

### List all active routes

```bash
curl http://localhost:9090/manage/routes
```

Returns an array of `RouteStatusView`:

```json
[
  {
    "name":       "customer-lookup",
    "version":    "?",
    "sourceType": "rest",
    "sourcePath": "/v1/customers/{id}",
    "targetType": "soap",
    "status":     "Started"
  }
]
```

### Get full spec for one route

```bash
curl http://localhost:9090/manage/routes/customer-lookup
```

Returns the full `RouteSpec` JSON (source, target, transform, interceptors).
Useful for auditing exactly what config is running live.

### List registered component types

```bash
curl http://localhost:9090/manage/components
```

Returns all adapter types registered in the running `RouteAssembler`:

```json
{
  "sources":    ["rest", "direct"],
  "targets":    ["soap", "http"],
  "transforms": ["jolt", "xslt", "passthrough"]
}
```

This is also the endpoint the UI palette fetches at startup to know which components to show.

### Via UI

Go to **ROUTES** tab — the table shows all live routes with source type, path, target type, and status.

---

## 8. Deploy Routes at Runtime (No Restart)

Three ways to add or update a route without restarting the server:

### Option A — Via UI (Routes page)

1. Go to **ROUTES** tab → click **Deploy Route**
2. Paste YAML into the editor
3. Click **Deploy Route**

The 5-layer validation pipeline runs first. If all layers pass, the route goes live immediately.

### Option B — Via curl

```bash
curl -X POST http://localhost:9090/manage/routes \
  -H "Content-Type: text/plain" \
  --data-binary @customer-lookup.yaml
```

Response on success (`HTTP 200`):
```json
{ "passed": true, "issues": [] }
```

Response on validation failure (`HTTP 422`):
```json
{
  "passed": false,
  "issues": [
    { "layer": "SCHEMA", "ruleId": "SOURCE_TYPE", "message": "Unsupported source type: kafka" }
  ]
}
```

### Option C — Drop a file into the watch directory

See **Section 9** for the automatic file watcher.

---

## 9. Hot-Reload File Watcher

`HotReloadWatcher` is a background thread that monitors an external directory.
Drop a YAML file in → route loads automatically. No API call, no restart required.

### Two directories — know the difference

| Directory | Default location | Loads on |
|-----------|-----------------|----------|
| **Classpath routes** | `esb-runtime/src/main/resources/routes/*.yaml` | App startup only (restart required for changes) |
| **External watch dir** | `${user.home}/.esb/routes/` | File create / modify / delete — live, no restart |

### Watcher behaviour

| File event | Action |
|-----------|--------|
| `.yaml` / `.yml` created | Parse → validate → register route |
| File modified | Re-parse → reload route (old instance stopped first) |
| File deleted | Deregister route (name = filename minus extension) |

> **Naming rule:** `customer-lookup.yaml` → route named `customer-lookup`

### Deploy by dropping a file

```bash
# Windows
copy customer-lookup.yaml %USERPROFILE%\.esb\routes\

# macOS / Linux
cp customer-lookup.yaml ~/.esb/routes/
```

Log output:
```
HotReloadWatcher: new file detected → customer-lookup.yaml
HotReloadWatcher [file-create]: ✓ route 'customer-lookup' loaded
```

### Configure a custom watch directory

In `esb-runtime/src/main/resources/application.yaml`:
```yaml
esb:
  routes:
    store-dir: D:/FineXaTech/POC/esb/esb-runtime/routes
```

Or override at startup (ideal for multi-broker — see Section 10):
```bash
mvn spring-boot:run -pl esb-runtime \
  -Desb.routes.store-dir=D:/FineXaTech/POC/esb/routes/broker-a
```

### Startup scan

At startup the watcher scans the watch directory and loads any pre-existing YAML files.
Routes deployed in a previous session survive a server restart this way.

---

## 10. Multi-Broker Deployment

Each broker runs its own isolated ESB instance (one JVM per broker).
The `store-dir` property gives each instance its own private route directory.

### Architecture

```
Broker A  (port 9091)                  Broker B  (port 9092)
store-dir: /routes/broker-a/           store-dir: /routes/broker-b/

  customer-lookup  (REST → SOAP)         order-submit   (REST → HTTP)
  account-update   (REST → SOAP)         payment-post   (REST → SOAP)
```

### Start Broker A

```bash
mvn spring-boot:run -pl esb-runtime \
  -Dserver.port=9091 \
  -Desb.routes.store-dir=D:/FineXaTech/POC/esb/routes/broker-a
```

### Start Broker B

```bash
mvn spring-boot:run -pl esb-runtime \
  -Dserver.port=9092 \
  -Desb.routes.store-dir=D:/FineXaTech/POC/esb/routes/broker-b
```

### Deploy a route to Broker A only

```bash
curl -X POST http://localhost:9091/manage/routes \
  -H "Content-Type: text/plain" \
  --data-binary @customer-lookup.yaml
```

Broker B is completely unaffected — fully isolated route registry.

### Persist routes across restarts

Routes deployed via `POST /manage/routes` are in-memory only.
To survive a restart, also write the YAML file to the broker's `store-dir`.
The startup scan loads it automatically.

### Checklist for multi-broker setup

```
[ ] 1. Create separate route directories for each broker
[ ] 2. Start each ESB instance with a different port (-Dserver.port=...)
[ ] 3. Point each to its own store-dir (-Desb.routes.store-dir=...)
[ ] 4. Use a reverse proxy (nginx / HAProxy) to route external traffic to the right broker
```

---

## 11. Add a New Camel Component

> Pattern: every new component = 1 Java class + 1 YAML override.
> `RouteAssembler` is **immutable** — you never touch it.

### File locations

```
esb-adapters/src/main/java/com/finexatech/esb/adapters/
  source/          ← add SourceAdapter implementations here
  target/          ← add TargetAdapter implementations here
  transform/       ← add TransformAdapter implementations here

esb-spec/src/main/java/com/finexatech/esb/spec/
  RouteSpec.java   ← add new fields to SourceSpec / TargetSpec if needed

esb-compiler/src/main/java/com/finexatech/esb/compiler/
  validation/rules/  ← add SchemaRule for new fields

components/overrides/   ← UI palette metadata YAML
```

---

### Full example: Add Kafka Source (T1)

#### Step 1 — Maven dependency (`esb-adapters/pom.xml`)

```xml
<dependency>
    <groupId>org.apache.camel.springboot</groupId>
    <artifactId>camel-kafka-starter</artifactId>
    <!-- version managed by camel-spring-boot-bom -->
</dependency>
```

#### Step 2 — Implement SourceAdapter

```java
// esb-adapters/src/main/java/com/finexatech/esb/adapters/source/KafkaSourceAdapter.java

@Component
public class KafkaSourceAdapter implements SourceAdapter {

    @Override
    public String protocol() {
        return "kafka";          // matches YAML: source.type: kafka
    }

    @Override
    public String buildFromUri(RouteSpec.SourceSpec source) {
        return "kafka:" + source.getTopic()
             + "?brokers="         + source.getBrokers()
             + "&groupId="         + source.getGroupId()
             + "&autoOffsetReset=earliest"
             + "&maxPollRecords=100";
    }

    @Override
    public void configure(RouteDefinition route, RouteSpec.SourceSpec source) {
        // Unmarshal JSON payload automatically
        route.unmarshal().json();
    }
}
```

#### Step 3 — Add fields to RouteSpec (`esb-spec`)

```java
// Inside RouteSpec.SourceSpec

private String topic;       // kafka topic name
private String brokers;     // e.g. "localhost:9092"
private String groupId;     // consumer group ID
```

#### Step 4 — Add schema validation rule (`esb-compiler`)

```java
// Inside SchemaValidationRule.java — add to the existing switch/if block

case "kafka" -> {
    require(source.getTopic(),   "source.topic",   issues);
    require(source.getBrokers(), "source.brokers", issues);
    require(source.getGroupId(), "source.groupId", issues);
}
```

#### Step 5 — UI palette override (`components/overrides/kafka-source.yaml`)

```yaml
id: kafka-source
label: Kafka Source
nodeType: source
tier: T1
icon: stream
color: "#16a34a"
description: Consume messages from an Apache Kafka topic
defaults:
  subType: kafka
  topic: my-topic
  brokers: localhost:9092
  groupId: esb-consumer
fields:
  - name: topic
    label: Topic Name
    type: string
    required: true
    placeholder: "orders.new"
  - name: brokers
    label: Bootstrap Servers
    type: string
    required: true
    placeholder: "localhost:9092"
  - name: groupId
    label: Consumer Group
    type: string
    required: true
    placeholder: "esb-consumer"
```

#### Step 6 — Use it in a YAML route

```yaml
apiVersion: esb/v1
kind: Route
metadata:
  name: order-events-route
source:
  type: kafka
  topic: orders.new
  brokers: localhost:9092
  groupId: esb-consumer
target:
  type: http
  endpointUrl: http://order-processor/api/orders
  timeout: 10000
transform:
  request:
    type: passthrough
interceptors:
  - type: correlation
  - type: retry
    config:
      maxAttempts: 3
```

---

### Component tier reference

| Tier | Components | Status |
|------|-----------|--------|
| **T0** | REST source, SOAP target, HTTP target, Jolt/XSLT transform | ✅ Done (Phase 1) |
| **T1** | Kafka source/target, JMS source/target | 🔜 Phase 2 |
| **T2** | Timer, File, SFTP, HTTP outbound | 🔜 Phase 2 |
| **T3** | FIXML, JDBC, gRPC, SAP RFC | 🔜 Phase 3 (on demand) |

### Checklist for every new component

```
[ ] 1. Add Maven dependency to esb-adapters/pom.xml
[ ] 2. Create XxxAdapter.java implementing SourceAdapter / TargetAdapter / TransformAdapter
[ ] 3. Add @Component — Spring auto-registers it, RouteAssembler picks it up
[ ] 4. Add new fields to RouteSpec.SourceSpec / TargetSpec if needed
[ ] 5. Add schema validation rule for the new fields in SchemaValidationRule.java
[ ] 6. Add override YAML in components/overrides/ for UI palette
[ ] 7. Write a test YAML route and validate it through the UI
```

> The `RouteAssembler` is **never modified**. It discovers adapters by their `protocol()` return value
> automatically via Spring's component scan.

---

## Quick Reference

```bash
# Start backend
mvn spring-boot:run -pl esb-runtime

# Start frontend
cd esb-ui && npm run dev -- --port 3000

# Health check
curl http://localhost:9090/manage/health

# List routes
curl http://localhost:9090/manage/routes

# Get full spec of one route
curl http://localhost:9090/manage/routes/customer-lookup

# List registered component types (sources / targets / transforms)
curl http://localhost:9090/manage/components

# Deploy route from file
curl -X POST http://localhost:9090/manage/routes \
  -H "Content-Type: text/plain" \
  --data-binary @my-route.yaml

# Validate without deploying
curl -X POST http://localhost:9090/manage/routes/validate \
  -H "Content-Type: text/plain" \
  --data-binary @my-route.yaml

# Test a deployed route
curl http://localhost:9090/api/v1/customers/123

# Delete a route
curl -X DELETE http://localhost:9090/manage/routes/customer-lookup
```
