# ESB Platform — Complete Architecture Reference
> Version: 2.0 | Status: Living Document | Stack: Apache Camel 4.7.x + Spring Boot 3.3.x

---

## Table of Contents

1. [Vision & Core Principle](#1-vision--core-principle)
2. [The Key Insight: Camel Already Has the Catalog](#2-the-key-insight-camel-already-has-the-catalog)
3. [Full System Architecture](#3-full-system-architecture)
4. [Module Structure](#4-module-structure)
5. [Three-Tier Adapter Model](#5-three-tier-adapter-model)
6. [Component Tier Rollout Strategy](#6-component-tier-rollout-strategy)
7. [RouteAssembler — The Immutable Core](#7-routeassembler--the-immutable-core)
8. [RouteSpec YAML Reference](#8-routespec-yaml-reference)
9. [Validation Architecture — 5 Layers](#9-validation-architecture--5-layers)
10. [Interceptor Chain](#10-interceptor-chain)
11. [Management API Reference](#11-management-api-reference)
12. [Drag-and-Drop UI Integration](#12-drag-and-drop-ui-integration)
13. [Spring Profiles](#13-spring-profiles)
14. [Mock Bank Service (Demo)](#14-mock-bank-service-demo)
15. [How to Add a New Component](#15-how-to-add-a-new-component)
16. [Development Phases](#16-development-phases)
17. [Technology Stack](#17-technology-stack)
18. [Risk Register](#18-risk-register)

---

## 1. Vision & Core Principle

### What This System Is

A configuration-driven Enterprise Service Bus where:
- Routes are declared as **YAML specs** (human-readable, Git-stored)
- A **compiler** validates and assembles Camel routes from specs
- A **runtime** loads and manages live routes in Spring Boot
- A **UI** draws pipelines visually that emit the same YAML
- **300+ Camel components** are supported without touching core code

### The One Rule That Prevents Mess

```
┌─────────────────────────────────────────────────────────────┐
│              THE CLOSED CORE PRINCIPLE                      │
│                                                             │
│  RouteAssembler     → NEVER changes                         │
│  ValidationPipeline → NEVER changes                         │
│  LiveRouteRegistry  → NEVER changes                         │
│                                                             │
│  Adding a new component = adding files in ONE place only    │
│  Adding a new route     = adding ONE YAML file              │
│  Adding a new rule      = adding ONE class                  │
│                                                             │
│  Core is CLOSED for modification.                           │
│  Adapters are OPEN for extension.                           │
└─────────────────────────────────────────────────────────────┘
```

### What Breaks Systems Like This

| Anti-Pattern | Why It Breaks | Our Fix |
|---|---|---|
| One generator per source→target pair | N×M explosion | Source + Target adapters (N+M) |
| Manual component metadata | Stale, incomplete | Use Camel's built-in catalog |
| Validation scattered everywhere | Inconsistent, hard to test | Single `ValidationPipeline` |
| Adapters know about each other | Tight coupling | Assembler owns composition |
| UI calls Camel directly | Fragile, no validation | UI → YAML → pipeline only |

---

## 2. The Key Insight: Camel Already Has the Catalog

Apache Camel ships machine-readable JSON descriptors for every one of its 300+
components — every parameter, its type, default, whether required, URI path or
query option. **Two catalog types exist. Use the right one for each purpose.**

```
RuntimeCamelCatalog  (inside running CamelContext)
  ├─ knows only components actually on the classpath
  ├─ obtained from: camelContext.getCamelContextExtension()
  │                              .getContextPlugin(RuntimeCamelCatalog.class)
  └─ use for: runtime validation, URI check, component listing

DefaultCamelCatalog  (standalone, Maven artifact: camel-catalog)
  ├─ knows all ~350 components ever built
  ├─ obtained from: new DefaultCamelCatalog(true)
  └─ use for: build-time tooling, offline linting, full component palette in UI
```

**This means:**
- We do NOT manually describe 300+ components — the catalog provides it all
- RuntimeCamelCatalog auto-discovers components from `META-INF/services/` in each JAR
- Adding `camel-kafka` to pom.xml makes kafka appear in the catalog automatically
- Our overlay YAMLs add UI metadata (icons, tiers, visible params) on top

```java
// ── RUNTIME CATALOG (use in production code) ─────────────────────────
// Camel 4.x canonical API — not the deprecated adapt() from Camel 3.x
RuntimeCamelCatalog catalog = camelContext
    .getCamelContextExtension()
    .getContextPlugin(RuntimeCamelCatalog.class);

List<String> onClasspath = catalog.findComponentNames();  // only what's actually available
String json = catalog.componentJSon("cxf");              // null if not on classpath

// Validate a URI — rich result object
EndpointValidationResult result = catalog.validateEndpointProperties(
    "cxf://http://host/svc?serviceClass=com.Svc&wsdlURL=file:svc.wsdl",
    false,   // ignoreSeverity
    false,   // consumerOnly
    true     // producerOnly ← important: validate as a "to" endpoint
);

// ── YAML ROUTE HOT-RELOAD (Camel 4.x PluginHelper) ──────────────────
import org.apache.camel.support.PluginHelper;
RoutesLoader loader = PluginHelper.getRoutesLoader(camelContext);
Resource res = ResourceHelper.resolveResource(camelContext, "file:/opt/esb/routes/foo.yaml");
loader.loadRoutes(res);   // adds and starts the route

// Stop + remove + reload pattern for hot-reload:
camelContext.getRouteController().stopRoute("foo-route");
camelContext.removeRoute("foo-route");
loader.loadRoutes(updatedResource);
```

**Key Camel 4.x vs 3.x differences:**
- `camelContext.adapt(ExtendedCamelContext.class)` → deprecated, use `getCamelContextExtension()`
- All `javax.*` → `jakarta.*` (Spring Boot 3.x requirement)
- Java 17 minimum (strict Camel 4.x requirement)
- `spring.factories` → `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`
- YAML DSL hot-reload via `camel.main.routes-reload-*` properties (production-ready in 4.x)

---

## 3. Full System Architecture

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                          ESB PLATFORM                                        ║
║                                                                              ║
║  ┌─────────────────────────────────────────────────────────────────────┐    ║
║  │                        DATA LAYER (Git / Filesystem)                │    ║
║  │  routes/*.yaml    transforms/*.jolt   wsdl/*.wsdl                   │    ║
║  │  Stored in: classpath (demo) | /opt/esb/routes/${BROKER_ID} (prod)  │    ║
║  └────────────────────────────┬────────────────────────────────────────┘    ║
║                               │ file watch / startup scan                    ║
║  ┌────────────────────────────▼────────────────────────────────────────┐    ║
║  │                     COMPILER LAYER (esb-compiler)                   │    ║
║  │                                                                     │    ║
║  │  RouteSpecParser → ValidationPipeline → RouteAssemblerFacade        │    ║
║  │                         │                    │                      │    ║
║  │              ┌──────────▼──────────┐  ┌──────▼──────────────────┐  │    ║
║  │              │  ValidationPipeline  │  │  RouteAssembler         │  │    ║
║  │              │  L1 Structural       │  │  ComplexRouteAssembler  │  │    ║
║  │              │  L2 Schema           │  │  (EIP patterns)         │  │    ║
║  │              │  L3 Semantic         │  └──────┬──────────────────┘  │    ║
║  │              │  L4 Compatibility    │         │                      │    ║
║  │              │  L5 DryRun           │         │                      │    ║
║  │              └──────────────────────┘         │                      │    ║
║  │              ┌────────────────────────────────▼──────────────────┐  │    ║
║  │              │              ADAPTER REGISTRIES                    │  │    ║
║  │              │                                                    │  │    ║
║  │              │  SourceAdapters:    rest | direct | timer          │  │    ║
║  │              │  TargetAdapters:    soap | rest | http-logged |    │  │    ║
║  │              │                    mock-response | mock-echo       │  │    ║
║  │              │  TransformAdapters: jolt | groovy | passthrough    │  │    ║
║  │              │  InterceptorChain:  audit | error | retry | corr   │  │    ║
║  │              └────────────────────────────────────────────────────┘  │    ║
║  └────────────────────────────┬────────────────────────────────────────┘    ║
║                               │ assembled RouteBuilder instances             ║
║  ┌────────────────────────────▼────────────────────────────────────────┐    ║
║  │                     RUNTIME LAYER (esb-runtime :9090)               │    ║
║  │                                                                     │    ║
║  │  CamelContext ─── LiveRouteRegistry ─── HotReloadWatcher            │    ║
║  │       │                                                             │    ║
║  │  Live Routes: [any YAML spec hot-loaded from filesystem]            │    ║
║  │    bank-balance  [REST→SOAP]    [RUNNING]                           │    ║
║  │    ...           [REST→REST]    [RUNNING]                           │    ║
║  └────────────────────────────┬────────────────────────────────────────┘    ║
║                               │                                              ║
║  ┌────────────────────────────▼────────────────────────────────────────┐    ║
║  │                  OBSERVABILITY LAYER                                │    ║
║  │  MDC Correlation IDs │ AuditStore (in-memory) │ Structured Logs     │    ║
║  └─────────────────────────────────────────────────────────────────────┘    ║
║                                                                              ║
║  ┌─────────────────────────────────────────────────────────────────────┐    ║
║  │                   MANAGEMENT API  (/manage/*)                       │    ║
║  │  GET/POST /manage/routes     list + deploy routes                   │    ║
║  │  POST     /manage/routes/{name}/start|stop  lifecycle               │    ║
║  │  GET      /manage/audit      audit trail                            │    ║
║  │  GET      /manage/health     health summary                         │    ║
║  │  GET      /manage/components registered adapters                    │    ║
║  └─────────────────────────────────────────────────────────────────────┘    ║
║                                                                              ║
║  ┌─────────────────────────────────────────────────────────────────────┐    ║
║  │              DESIGNER (esb-designer :9191)                          │    ║
║  │  POST /manage/routes/validate   validate without deploying          │    ║
║  │  POST /manage/routes/save       validate + write to filesystem      │    ║
║  │  POST /manage/transform-preview execute transform with test data    │    ║
║  └─────────────────────────────────────────────────────────────────────┘    ║
║                                                                              ║
║  ┌─────────────────────────────────────────────────────────────────────┐    ║
║  │              UI (esb-ui :3000)                                      │    ║
║  │  React + Vite + TypeScript + Tailwind + React Flow                  │    ║
║  │  Dashboard | Routes | Route Builder | Validation | Audit            │    ║
║  └─────────────────────────────────────────────────────────────────────┘    ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## 4. Module Structure

```
esb/                                  (parent pom: esb-parent v1.0.0-SNAPSHOT)
│
├── esb-spec/                         ← Pure Java domain model. ZERO Spring.
│   └── com.finexatech.esb.spec/
│       ├── RouteSpec.java               Top-level spec container
│       ├── SourceSpec.java              type, method, path, name, auth, periodMs
│       ├── TargetSpec.java              type, endpointUrl, operation, wsdl, timeout, retry, auth, params
│       ├── TransformSpec.java           request + response TransformItemSpec
│       ├── TransformItemSpec.java       type, resource, inline
│       ├── ProcessSpec.java             sequential steps
│       ├── StepSpec.java                set-header|log|script|route-to|split|wire-tap
│       ├── RoutingSpec.java             content-based routing rules
│       ├── RoutingRule.java             condition, steps, target, isDefault
│       ├── ErrorSpec.java               deadLetter, fallbackHttpStatus, fallbackBody
│       ├── RetrySpec.java               maxAttempts, backoffType, delays, retryOn
│       ├── TimeoutSpec.java             connectMs, readMs
│       ├── CorrelationSpec.java         header, generateIfMissing, propagateToTarget
│       ├── AuthSpec.java                type, requiredRoles, username, password, apiKey
│       ├── ExpressionSpec.java          language, value
│       └── MetadataSpec.java            name, version, description, tags, owner
│
├── esb-compiler/                     ← Validation + Assembly. Thin Spring layer.
│   ├── assembly/
│   │   ├── RouteAssembler.java          Immutable core — linear routes
│   │   ├── RouteAssemblerFacade.java    Entry point — delegates to simple or complex
│   │   ├── ComplexRouteAssembler.java   Handles process steps + routing (EIP patterns)
│   │   ├── SourceAdapter.java           Interface: protocol(), buildFromUri(), configure()
│   │   ├── TargetAdapter.java           Interface: protocol(), buildToUri(), preProcessor()
│   │   ├── TransformAdapter.java        Interface: type(), buildProcessor()
│   │   ├── RouteInterceptor.java        Interface: order(), apply()
│   │   ├── RouteToStepApplier.java      Applies route-to steps
│   │   ├── SetHeaderStepApplier.java    Applies set-header steps
│   │   ├── SplitStepApplier.java        Applies split steps
│   │   ├── WireTapStepApplier.java      Applies wire-tap steps
│   │   ├── LogStepApplier.java          Applies log steps
│   │   ├── ScriptStepApplier.java       Applies script steps
│   │   └── EsbExpressionHelper.java     Evaluates simple/groovy/jsonpath expressions
│   ├── loader/
│   │   └── RouteSpecParser.java         Parses YAML → RouteSpec POJOs (Jackson)
│   └── validation/
│       ├── ValidationPipeline.java      5-layer orchestrator
│       ├── ValidationReport.java        {messages[], layerReached}
│       ├── ValidationMessage.java       field, message, severity
│       ├── ValidationLayer.java         STRUCTURAL|SCHEMA|SEMANTIC|COMPATIBILITY|DRY_RUN
│       ├── SpecRule.java                Interface for all rules
│       └── rules/
│           ├── RequiredFieldsRule.java  Source/target/transform present; skips mock types
│           ├── HttpMethodRule.java      Method in [GET, POST, PUT, DELETE, PATCH]
│           ├── RoutingValidationRule.java  Routing rules have exactly one default
│           └── EnvVarResolvableRule.java   ${VAR} references exist in environment
│
├── esb-adapters/                     ← All adapter implementations. ADD HERE ONLY.
│   ├── source/
│   │   ├── RestSourceAdapter.java       protocol: "rest" — Camel REST DSL
│   │   ├── DirectSourceAdapter.java     protocol: "direct" — direct:name endpoint
│   │   └── TimerSourceAdapter.java      protocol: "timer" — fixed schedule (periodMs)
│   ├── target/
│   │   ├── SoapTargetAdapter.java       protocol: "soap" — HTTP POST + SOAPAction header
│   │   │                                  ⚠ Must removeHeader(HTTP_PATH/URI/QUERY)
│   │   │                                    bridgeEndpoint=true alone is NOT sufficient
│   │   ├── RestTargetAdapter.java       protocol: "rest" — HTTP GET/POST/PUT/DELETE
│   │   ├── HttpLoggedTargetAdapter.java protocol: "http-logged" — HTTP with logging (demo)
│   │   ├── MockResponseTargetAdapter.java  protocol: "mock-response" — static response body
│   │   └── MockEchoTargetAdapter.java   protocol: "mock-echo" — echoes request back
│   ├── transform/
│   │   ├── GroovyTransformAdapter.java  type: "groovy" — inline Groovy scripts
│   │   │                                  ⚠ Use ${headers['key']} in GString; def creates
│   │   │                                    local var and breaks binding
│   │   ├── JoltTransformAdapter.java    type: "jolt" — declarative JSON→JSON transforms
│   │   └── PassthroughTransformAdapter.java  type: "passthrough" — identity
│   ├── interceptors/
│   │   ├── AuditInterceptor.java        order: 1 — records start time, method, path, sourceIp
│   │   ├── ErrorHandlingInterceptor.java  order: 10 — global exception handler
│   │   │                                  ⚠ GAP-003: fires BEFORE RetryInterceptor
│   │   │                                    Retry never executes. Fix: ResilienceInterceptor
│   │   ├── RetryInterceptor.java        order: 30 — retry on transient errors (currently broken)
│   │   └── CorrelationInterceptor.java  order: 50 — generates/propagates X-Correlation-ID
│   └── audit/
│       ├── AuditEvent.java              Record: id, routeName, correlationId, method, path,
│       │                                  sourceIp, statusCode, durationMs, timestamp
│       └── AuditStore.java              In-memory ring buffer; recent(limit), record()
│
├── esb-designer/                     ← Designer service. Port 9191.
│   └── com.finexatech.esb.designer/
│       ├── EsbDesignerApplication.java
│       ├── api/
│       │   ├── DesignerManagementController.java
│       │   │     POST /manage/routes/validate
│       │   │     POST /manage/routes/save
│       │   │     GET  /manage/routes
│       │   │     GET  /manage/components
│       │   ├── TransformPreviewController.java
│       │   │     POST /manage/transform-preview
│       │   ├── TransformPreviewRequest.java
│       │   ├── TransformPreviewResponse.java
│       │   └── TransformPreviewService.java
│       └── config/
│           └── CorsConfig.java          CORS: allow http://localhost:3000
│
├── esb-runtime/                      ← Spring Boot app. Wires everything. Port 9090.
│   └── com.finexatech.esb/
│       ├── EsbApplication.java          @SpringBootApplication, port 9090
│       ├── api/
│       │   ├── RouteManagementController.java   Full route lifecycle (see §11)
│       │   └── AuditController.java             GET /manage/audit?limit=50
│       ├── config/
│       │   ├── CamelRestConfig.java             REST DSL, Camel servlet /api/*
│       │   └── CorsConfig.java                  CORS: allow http://localhost:3000
│       ├── init/
│       │   └── InitRuntimeBanner.java           Startup banner (@Profile("init"))
│       ├── loader/
│       │   ├── RouteSpecLoader.java             Loads routes on startup (classpath + filesystem)
│       │   └── HotReloadWatcher.java            WatchService monitors routes directory
│       ├── mock/
│       │   └── MockSoapController.java          Mock SOAP endpoint (@Profile("demo"))
│       └── registry/
│           └── LiveRouteRegistry.java           route lifecycle: register/suspend/resume/deregister
│
├── mock-bank-service/                ← Standalone mock SOAP bank. Port 8080.
│   └── com.finexatech.mock.bank/
│       ├── MockBankApplication.java     @SpringBootApplication, port 8080
│       ├── BankSoapController.java      POST /soap/balance-service
│       │                                  GetAccountBalance SOAP operation
│       ├── AccountRegistry.java         In-memory account data (ACC001, ACC002, …)
│       └── StartupBanner.java           ASCII art startup banner
│
└── esb-ui/                           ← React + Vite + TypeScript + Tailwind. Port 3000.
    ├── src/
    │   ├── pages/
    │   │   ├── DashboardPage.tsx         Route counts, stats (Started/Stopped/Suspended)
    │   │   ├── RoutesPage.tsx            Route list: start/stop/delete/reload per route
    │   │   ├── RouteBuilderPage.tsx      React Flow canvas: drag-drop + live YAML editor
    │   │   ├── ValidationPage.tsx        Multi-layer validation results display
    │   │   ├── AuditPage.tsx             Audit trail: status badges, duration, sourceIp
    │   │   └── MonitoringPage.tsx        (placeholder)
    │   ├── components/
    │   │   ├── layout/
    │   │   │   ├── Layout.tsx, NavBar.tsx, TopBar.tsx
    │   │   ├── ui/
    │   │   │   ├── Card.tsx, Badge.tsx, StatusBadge.tsx, Button.tsx
    │   │   │   ├── Modal.tsx, Toast.tsx
    │   │   └── route-builder/
    │   │       ├── CodeEditorModal.tsx        Monaco editor (Groovy / XSLT)
    │   │       ├── JoltFieldMapperModal.tsx   Visual Jolt field mapper
    │   │       └── GroovySoapMapperModal.tsx  SOAP→REST Groovy mapper
    │   ├── hooks/
    │   │   ├── useRoutes.ts              Fetch routes + lifecycle actions
    │   │   ├── useToast.ts               Toast notification state
    │   │   └── useTransformPreview.ts    Call transform-preview API
    │   ├── api/
    │   │   └── esb-api.ts               Axios client for /manage/* endpoints
    │   └── types/
    │       └── index.ts                 TypeScript interfaces (RouteSpec, AuditEvent, …)
    └── .env.designer                    VITE_DESIGNER_URL + VITE_RUNTIME_URL
```

---

## 5. Three-Tier Adapter Model

Not all components need the same level of custom code. Three tiers of adapter:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ADAPTER TIERS                                    │
│                                                                     │
│  Tier A: GenericCamelAdapter  (future — not yet implemented)        │
│  ────────────────────────────                                       │
│  Works for 80%+ of Camel components.                                │
│  Uses ComponentDescriptor to build URI + pre/post processors.       │
│  Zero custom code needed. Just add an override YAML.                │
│  Examples: HTTP, FTP, File, Timer, Quartz, SFTP                     │
│                                                                     │
│  Tier B: SpecializedAdapter implements TargetAdapter directly       │
│  ──────────────────────────────────────────────────────             │
│  Full custom implementation for complex protocols.                  │
│  Examples: SoapTargetAdapter, RestTargetAdapter,                    │
│            HttpLoggedTargetAdapter                                  │
│                                                                     │
│  Tier C: MockAdapter  (demo/testing only — internal)                │
│  ──────────────────────────────────────────────────                 │
│  Static responses or echo for integration demos.                    │
│  Examples: MockResponseTargetAdapter, MockEchoTargetAdapter         │
│  Note: hidden from public palette via isInternal() in future        │
└─────────────────────────────────────────────────────────────────────┘
```

### Implemented Adapters

#### Source Adapters
| Protocol | Class | Notes |
|---|---|---|
| `rest` | RestSourceAdapter | Camel REST DSL; GET/POST/PUT/DELETE; path params; consumes/produces |
| `direct` | DirectSourceAdapter | `direct:name` endpoint; programmatic invocation |
| `timer` | TimerSourceAdapter | Fixed schedule polling; periodMs defaults to 5000 |

#### Target Adapters
| Protocol | Class | Notes |
|---|---|---|
| `soap` | SoapTargetAdapter | HTTP POST + SOAPAction; must `removeHeader(HTTP_PATH/URI/QUERY)`; basic auth |
| `rest` | RestTargetAdapter | HTTP GET/POST/PUT/DELETE; timeout; auth |
| `http-logged` | HttpLoggedTargetAdapter | HTTP with structured logging (demo only) |
| `mock-response` | MockResponseTargetAdapter | Static body + status code (demo/test only) |
| `mock-echo` | MockEchoTargetAdapter | Echoes request back (demo/test only) |

#### Transform Adapters
| Type | Class | Notes |
|---|---|---|
| `groovy` | GroovyTransformAdapter | Inline Groovy; `body`, `headers`, `exchange` in scope |
| `jolt` | JoltTransformAdapter | Declarative JSON→JSON; classpath or inline spec |
| `passthrough` | PassthroughTransformAdapter | Identity — no transformation |

### Adapter Registration

All adapters are Spring `@Component` beans. `RouteAssemblerFacade` resolves the right
adapter by matching `spec.source().type()` / `spec.target().type()` / `spec.transform().*.type()`
against the registered beans. No manual registration required — Spring component scan handles it.

```
RouteAssemblerFacade.assemble(spec)
  │
  ├─ Has process steps or routing?
  │    YES → ComplexRouteAssembler.assemble(spec)
  │    NO  → RouteAssembler.assemble(spec)
  │
  └─ RouteAssembler.assemble(spec)
       ├─ resolve SourceAdapter  by spec.source().type()
       ├─ resolve TargetAdapter  by spec.target().type()
       ├─ resolve TransformAdapter(request) by spec.transform().request().type()
       ├─ resolve TransformAdapter(response) by spec.transform().response().type()
       └─ build RouteBuilder:
            interceptors → from(source) → transform(req) → preProcessor → to(target)
                         → postProcessor → transform(resp)
```

---

## 6. Component Tier Rollout Strategy

Implement in tiers. Each tier is a complete, shippable increment.

```
T0 — CORE  ✓ COMPLETE
────────────────────────────────
Source:    rest, direct, timer
Target:    soap, rest, http-logged
Transform: jolt, groovy, passthrough
Routing:   linear + content-based router + process steps (EIP)
Goal:      REST→SOAP works end to end. Live demo ready.

T1 — MESSAGING (Phase 3)
───────────────────────────────────
Source:    JMS (ActiveMQ/Artemis), Kafka
Target:    JMS, Kafka, RabbitMQ
Routing:   Message Filter, Dead Letter Channel
Goal:      Async messaging patterns work.

T2 — INTEGRATION (Phase 3)
─────────────────────────────────────
Source:    File, SFTP
Target:    FTP/SFTP, File, SMTP
Routing:   Splitter, Aggregator, Wire Tap
Goal:      Batch/scheduled patterns work.

T3 — SPECIALIZED (per demand)
────────────────────────────────────────
Source/Target: FIXML, FIX protocol
Target:        JDBC, JPA, gRPC, SAP RFC
Routing:       Dynamic Router, Recipient List
Goal:          Domain-specific protocols. Demand-driven.

T4 — COMMUNITY (on demand)
───────────────────────────
Any Camel community component.
Add via: 1 adapter class + optional override YAML.
```

### Adding Tiers Without Breaking Anything

```
When T1 (Messaging) is ready:

1. Add camel-jms dependency to esb-adapters/pom.xml
2. Add JmsTargetAdapter.java  (implements TargetAdapter)
3. Add JmsSourceAdapter.java  (implements SourceAdapter)
4. Add JmsBrokerReachableRule.java  (semantic validation)
5. Update CompatibilityMatrix

Files changed in esb-compiler: ZERO
Files changed in esb-runtime:  ZERO
```

---

## 7. RouteAssembler — The Immutable Core

The `RouteAssembler` (and `ComplexRouteAssembler`) must never be modified after they
are written. All extension happens in adapters. Use `RouteAssemblerFacade` everywhere.

```java
// Always inject this — never RouteAssembler directly
@Autowired
private RouteAssemblerFacade assemblerFacade;

// Facade delegates automatically:
RouteBuilder rb = assemblerFacade.assemble(spec);
camelContext.addRoutes(rb);
```

### ComplexRouteAssembler (EIP Patterns)

Handles routes with `process` steps or `routing` blocks:

```java
// Step types handled by ComplexRouteAssembler
"set-header"  → SetHeaderStepApplier   (set exchange header from expression)
"log"         → LogStepApplier         (log message at specified level)
"script"      → ScriptStepApplier      (execute inline Groovy/expression)
"route-to"    → RouteToStepApplier     (branch to direct: endpoint)
"split"       → SplitStepApplier       (split body; parallelProcessing; timeout)
"wire-tap"    → WireTapStepApplier     (fire-and-forget to destination)
```

---

## 8. RouteSpec YAML Reference

### Complete Schema

```yaml
# ── METADATA ─────────────────────────────────────────────────────────
apiVersion: esb/v1
kind: RouteSpec

metadata:
  name: bank-balance-lookup          # kebab-case, unique across all routes
  version: "1.0"
  description: "POST /api/balance → SOAP GetAccountBalance"
  tags: [banking, soap]
  owner: integration-team

# ── SOURCE (inbound endpoint) ─────────────────────────────────────────
source:
  type: rest                         # rest | direct | timer
  method: POST                       # GET | POST | PUT | DELETE | PATCH
  path: /balance                     # NOTE: no /api prefix — Camel adds /api/*
  consumes: application/json
  produces: application/json
  auth:
    type: none                       # jwt | basic | api-key | none
    requiredRoles: [ROLE_USER]       # (parsed but NOT enforced — decorative only)
  periodMs: 5000                     # timer only

# ── TARGET (outbound call) ────────────────────────────────────────────
target:
  type: soap                         # soap | rest | http-logged | mock-response | mock-echo
  endpointUrl: "${SOAP_BANK_URL}"    # ALWAYS env var; never hardcoded
  operation: GetAccountBalance       # SOAP operation name (SOAPAction header)
  wsdl: classpath:wsdl/bank.wsdl    # optional
  auth:
    type: basic
    username: "${SOAP_USER}"
    password: "${SOAP_PASS}"
  timeout:
    connectMs: 5000
    readMs: 30000
  retry:
    maxAttempts: 3
    backoffType: exponential         # fixed | exponential
    initialDelayMs: 1000
    multiplier: 2.0
    maxDelayMs: 30000
    retryOn: [CONNECTION_REFUSED, HTTP_503, TIMEOUT]
    doNotRetryOn: [HTTP_400, HTTP_401, HTTP_403]
  # mock-response fields:
  mockBody: '{"status":"ok"}'
  mockStatusCode: 200
  params:
    key: value                       # component-specific extra params

# ── TRANSFORMS ────────────────────────────────────────────────────────
transform:
  request:
    type: groovy                     # jolt | groovy | passthrough
    inline: |
      def acct = body.accountNumber
      body = "<soap:Envelope ...><acct>${acct}</acct></soap:Envelope>"
  response:
    type: jolt
    resource: classpath:jolt/balance-response.json
    # inline: '[{"operation":"shift","spec":{...}}]'

# ── PROCESS STEPS (optional, runs before target) ──────────────────────
process:
  steps:
    - id: set-correlation
      type: set-header
      name: X-Request-Source
      expression:
        language: constant
        value: "esb-runtime"
    - id: log-request
      type: log
      message: "Processing balance request for ${body.accountNumber}"
      level: INFO
    - id: enrich
      type: script
      language: groovy
      inline: |
        headers['X-Timestamp'] = new Date().toInstant().toString()

# ── CONTENT-BASED ROUTING (optional) ─────────────────────────────────
routing:
  type: content-based
  rules:
    - id: vip-account
      condition:
        language: jsonpath
        value: "$.accountType == 'VIP'"
      target:
        type: soap
        endpointUrl: "${VIP_SOAP_URL}"
        operation: GetPremiumBalance
    - id: standard
      isDefault: true
      target:
        type: soap
        endpointUrl: "${SOAP_BANK_URL}"
        operation: GetAccountBalance

# ── ERROR HANDLING ────────────────────────────────────────────────────
errorHandling:
  deadLetter: direct:global-error-handler
  fallbackHttpStatus: 503
  fallbackBody: '{"code":"SERVICE_UNAVAILABLE","message":"Please retry later"}'

# ── OBSERVABILITY ─────────────────────────────────────────────────────
correlation:
  header: X-Correlation-ID
  generateIfMissing: true
  propagateToTarget: true
```

### YAML Path Rules

```
⚠ IMPORTANT: Route YAML paths must NOT include the /api prefix.
             Camel REST DSL + CamelRestConfig maps servlet to /api/*.
             What you write in YAML → What the caller hits:
               path: /balance       →  POST http://host:9090/api/balance
               path: /v1/customers  →  GET  http://host:9090/api/v1/customers
```

---

## 9. Validation Architecture — 5 Layers

### The Pipeline

```java
// ValidationPipeline runs rules layer by layer, stopping at first ERROR
ValidationReport report = pipeline.validate(spec, ValidationLayer.DRY_RUN);
// report.getMessages()     — all messages across layers
// report.getLayerReached() — how far validation got
```

### All Rules by Layer

```
L1 STRUCTURAL (< 10ms — runs client-side + server)
  RequiredFieldsRule        source, target, transform present
                            (skips endpointUrl check for mock-response and mock-echo)
  HttpMethodRule            method in [GET, POST, PUT, DELETE, PATCH]
  RoutingValidationRule     content-based routing has exactly one default branch
  RetryConfigRule           maxAttempts 1–10, delays positive integers
  TimeoutRule               connectMs < readMs, both > 0

L2 SCHEMA (< 10ms — server only)
  SourceTypeKnownRule       type is a registered SourceAdapter.protocol()
  TargetTypeKnownRule       type is a registered TargetAdapter.protocol()
  TransformTypeKnownRule    type in [jolt, groovy, passthrough]
  EnumValuesRule            enum fields match adapter-reported values
  ConditionSyntaxRule       routing condition expressions parse without error

L3 SEMANTIC (100ms–2s — results cached)
  WsdlExistsRule            wsdl file/URL loads and is valid XML
  WsdlOperationExistsRule   operation name exists in WSDL port
  JoltSpecValidRule         Jolt spec JSON is valid and parses
  EnvVarResolvableRule      all ${VAR} references exist in environment/config
  TransformResourceRule     all resource: classpath:... files exist on classpath

L4 COMPATIBILITY (< 50ms — server only)
  SourceTargetCompatRule    compatibility matrix check
  TransformFormatRule       if target=soap, request transform output must be XML
  PathConflictRule          no two live routes on same method+path
  RoutingBranchCompatRule   each routing branch passes SourceTargetCompatRule

L5 DRY_RUN (1–5s — server only)
  CamelDryRunRule           builds route in isolated CamelContext with mock components
                            catches: bad URIs, missing beans, invalid expressions
```

### ValidationReport Response Format

```json
{
  "specName": "bank-balance-lookup",
  "layerReached": "DRY_RUN",
  "passed": false,
  "messages": [
    {
      "layer": "SEMANTIC",
      "field": "target.operation",
      "message": "Operation 'GetBalance' not found. Available: [GetAccountBalance, GetHistory]",
      "severity": "ERROR"
    },
    {
      "layer": "COMPATIBILITY",
      "message": "SOAP_FAULT not in retryOn list. Add if your operation is idempotent.",
      "severity": "WARNING"
    }
  ]
}
```

> Note: The UI normalizes this via `normalizeValidationResponse()` — backend returns
> `{ messages[], layerReached }` not `{ layers[] }`.

---

## 10. Interceptor Chain

Interceptors are applied to every route in `order()` sequence. All implement `RouteInterceptor`.

| Order | Class | Status | Description |
|---|---|---|---|
| 1 | AuditInterceptor | ✓ EXISTS | Records method, path, sourceIp at start; writes AuditEvent on completion |
| 5 | AuthInterceptor | TODO Phase 3 | AuthSpec is parsed but NOT enforced; currently decorative only |
| 6 | IdempotentConsumerInterceptor | TODO Phase 3 | Idempotent consumer with configurable key expression |
| 8 | RateLimitInterceptor | TODO Phase 3 | Token bucket per route; configurable burst |
| 10 | ErrorHandlingInterceptor | ✓ EXISTS ⚠ | Global exception handler — see GAP-003 below |
| 30 | RetryInterceptor | ✓ EXISTS ⚠ | Retry on transient errors — currently broken by GAP-003 |
| 50 | CorrelationInterceptor | ✓ EXISTS | Generates/propagates X-Correlation-ID; sets MDC |

### GAP-003 — Critical Interceptor Bug

```
BUG: ErrorHandlingInterceptor (order=10) catch-all fires BEFORE RetryInterceptor (order=30).
     RetryInterceptor NEVER executes — errors are swallowed by ErrorHandlingInterceptor first.

FIX: Replace ErrorHandlingInterceptor + RetryInterceptor with a single ResilienceInterceptor
     (order=10) that handles the correct exception hierarchy:
       transient (ConnectException, SocketTimeoutException, HTTP 5xx) → retry with backoff
       permanent (HTTP 4xx, validation errors) → immediate dead-letter + fallback response
```

### AuditStore

`AuditStore` is an in-memory ring buffer injected into `AuditInterceptor`. Each
`AuditEvent` captures:

```java
record AuditEvent(
    String id,             // UUID
    String routeName,
    String correlationId,  // X-Correlation-ID if present
    String method,         // HTTP method
    String path,           // request path
    String sourceIp,       // caller IP
    int    statusCode,     // response status
    long   durationMs,     // total route execution time
    Instant timestamp
)
```

Query: `GET /manage/audit?limit=50` — returns most recent N events.

---

## 11. Management API Reference

### esb-runtime (port 9090)

```
— Route Lifecycle —
GET    /manage/routes                   List all routes with status (name, state, specVersion)
GET    /manage/routes/{name}            Get single route spec as YAML
POST   /manage/routes                   Deploy new route (YAML body)
PUT    /manage/routes/{name}/reload     Hot-reload from disk without restart
POST   /manage/routes/{name}/stop       Suspend route (keeps registration)
POST   /manage/routes/{name}/start      Resume suspended route
DELETE /manage/routes/{name}            Deregister and remove route
POST   /manage/routes/{name}/persist    Save in-memory route to filesystem

— Audit & Health —
GET    /manage/audit?limit=50           Recent audit events (AuditEvent[])
GET    /manage/health                   Health summary {status: UP|DEGRADED, routes: [...]}
GET    /manage/components               List registered adapters by type

— Camel Business Routes —
REST   /api/*                           All deployed REST routes (via Camel servlet)

— Spring Actuator —
GET    /actuator/health
GET    /actuator/metrics
GET    /actuator/camelroutes
```

### esb-designer (port 9191)

```
POST   /manage/routes/validate          Validate YAML without deploying
                                          body: RouteSpec YAML
                                          returns: ValidationReport
POST   /manage/routes/save              Validate + write to output directory
                                          body: RouteSpec YAML
GET    /manage/routes                   List saved route YAML files
GET    /manage/components               Registered adapters (source/target/transform)
POST   /manage/transform-preview        Execute transform with test data
                                          body: { type, spec, input }
                                          returns: { output, error }
```

### mock-bank-service (port 8080)

```
POST   /soap/balance-service            GetAccountBalance SOAP operation
                                          input: XML with <accountNumber>
                                          output: SOAP envelope with balance/currency/holder
```

---

## 12. Drag-and-Drop UI Integration

### What the UI Does (and Does Not Do)

```
UI RESPONSIBILITY                        SERVER RESPONSIBILITY
────────────────                         ─────────────────────
Draw nodes (from /manage/components)     Validate WSDL exists
Render property panels                   Compile transforms
Basic field format checks                Check env vars
Build RouteSpec JSON/YAML               Run DryRun compiler
Send to /manage/routes/validate         Manage live routes
Display ValidationReport                Hot-reload
Never talk to Camel directly            Write to filesystem
Never call SOAP/WSDL URLs               Enforce path conflicts
```

### UI ↔ Server API Contract

```
GET  /manage/components
     → List<AdapterDescriptor>   (source + target + transform adapters)
     → grouped by type/role

POST /manage/routes/validate
     body: RouteSpec YAML
     → ValidationReport { messages[], layerReached }

POST /manage/routes
     body: RouteSpec YAML (runtime deploy)
     → requires DRY_RUN validation to have passed
     → deploys route to live CamelContext
     → returns RouteStatus

GET  /manage/routes
     → List<RouteStatus> { name, status, specVersion, uptime }

POST /manage/routes/{name}/stop
POST /manage/routes/{name}/start
DELETE /manage/routes/{name}

GET  /manage/audit?limit=50
     → AuditEvent[]
```

### Validation Trigger Flow in UI

```
User action                    API call                          Debounce
───────────────────────────────────────────────────────────────────────────
Type in any field            → /manage/routes/validate (L1)      100ms
Drop a source component      → /manage/routes/validate (L2)       50ms
Drop a target component      → /manage/routes/validate (L2)       50ms
Upload WSDL/XSLT file        → /manage/routes/validate (L3)    immediate
Click "Validate All"         → /manage/routes/validate (DRY_RUN) spinner
Click "Deploy"               → POST /manage/routes (runtime)
```

---

## 13. Spring Profiles

Three profiles control runtime behaviour. Default is `demo`.

### demo (default)

```yaml
# application-demo.yaml
esb:
  routes:
    scan-pattern: "classpath:routes/*.yaml"
    store-dir: ${user.dir}/routes
camel:
  servlet:
    context-path: "/api/*"
logging:
  level:
    com.finexatech.esb: DEBUG

Beans active:
  MockSoapController   (@Profile("demo"))   — internal SOAP mock at /mock/soap
  HotReloadWatcher     — watches store-dir for YAML changes

Use for: local development, demos, integration testing
```

### init (includes demo)

```yaml
# application-init.yaml (Spring profile groups: init → [demo])
esb:
  routes:
    store-dir: ${user.dir}/routes/dev    # isolated dev directory

Beans active:
  InitRuntimeBanner    (@Profile("init"))  — prints dev/debug banner
  All demo beans (via profile group)

Use for: developer workstations; clean slate each run
```

### production

```yaml
# application-production.yaml
esb:
  routes:
    scan-pattern: ""                         # NO classpath scan
    store-dir: /opt/esb/routes/${BROKER_ID}  # per-broker PVC mount (K8s)
logging:
  level:
    com.finexatech.esb: INFO
  file:
    name: ${user.dir}/logs/esb-runtime.log

Beans active:
  MockSoapController   NOT active
  HotReloadWatcher     — watches /opt/esb/routes/${BROKER_ID}/

Use for: K8s deployments; JSON structured logs; no classpath routes
```

### Multi-Broker (K8s)

```
Broker     Namespace       BROKER_ID     Route prefix
─────────────────────────────────────────────────────
Saudi      esb-saudi        broker-sa    broker-sa-*
Kuwait     esb-kuwait       broker-kw    broker-kw-*
Dev        esb-dev          broker-dev   broker-dev-*
```

Route names must match pattern: `^(broker-sa|broker-kw|broker-dev)-[a-z0-9-]+$`
(enforced by BrokerIsolationRule — Phase 3).

---

## 14. Mock Bank Service (Demo)

The `mock-bank-service` module is a standalone Spring Boot application (no Camel)
that simulates a legacy bank's SOAP endpoint for demo purposes.

```
Start:  cd mock-bank-service && ./start.sh   (or start.bat on Windows)
Stop:   ./stop.sh

Port:   8080
Endpoint: POST http://localhost:8080/soap/balance-service
```

### SOAP Contract

```xml
<!-- Request -->
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetAccountBalance>
      <accountNumber>ACC001</accountNumber>
    </GetAccountBalance>
  </soap:Body>
</soap:Envelope>

<!-- Response -->
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetAccountBalanceResponse>
      <accountNumber>ACC001</accountNumber>
      <accountHolder>Ahmed Al-Rashid</accountHolder>
      <balance>125000.00</balance>
      <currency>SAR</currency>
      <lastUpdated>2025-03-11T...</lastUpdated>
    </GetAccountBalanceResponse>
  </soap:Body>
</soap:Envelope>
```

### Pre-loaded Accounts

| Account # | Holder | Balance | Currency |
|---|---|---|---|
| ACC001 | Ahmed Al-Rashid | 125,000 | SAR |
| ACC002 | Fatima Al-Zahra | 87,500 | SAR |
| ACC003 | Mohammed Al-Farsi | 250,000 | SAR |
| ACC004 | Sara Al-Otaibi | 45,000 | SAR |

Unknown accounts return a SOAP Fault with code `ACCOUNT_NOT_FOUND`.

---

## 15. How to Add a New Component

### The Checklist (follow every time — no exceptions)

```
Step 1: Decide adapter tier
  □ Protocol maps cleanly to a single Camel URI?  → Tier B SpecializedAdapter
  □ Completely proprietary / no Camel component?  → Tier B CustomAdapter

Step 2: Write adapter
  □ Create esb-adapters/target/{Name}TargetAdapter.java
  □ Implement TargetAdapter interface
  □ Annotate @Component
  □ Implement: protocol(), buildToUri(), preProcessor(), postProcessor()
  □ Write unit test: verify buildToUri() produces correct URI

Step 3: Add semantic validation rule (if needed)
  □ Create esb-compiler/validation/rules/semantic/{Name}ExistsRule.java
  □ Implement SpecRule; set layer = ValidationLayer.SEMANTIC
  □ Annotate @Component
  □ Write unit test

Step 4: Update compatibility matrix
  □ Open CompatibilityMatrix.java
  □ Add valid source↔target combinations for the new scheme

Step 5: Add Maven dependency
  □ Add camel-{component} to esb-adapters/pom.xml

Step 6: Test
  □ Unit test: adapter builds correct URI from sample spec
  □ Integration test: end-to-end route with mock endpoint
  □ DryRun test: CamelDryRunCompiler accepts the assembled route

Step 7: Document
  □ Add entry to this section
  □ Add example YAML to docs/examples/{scheme}-example.yaml
```

### Critical Patterns for New Adapters

```java
// SOAP: always remove HTTP routing headers before bridging
@Override
public Processor preProcessor(TargetSpec spec) {
    return exchange -> {
        exchange.getIn().removeHeader(Exchange.HTTP_PATH);
        exchange.getIn().removeHeader(Exchange.HTTP_URI);
        exchange.getIn().removeHeader(Exchange.HTTP_QUERY);
        exchange.getIn().setHeader("SOAPAction", spec.getOperation());
    };
}

// Groovy transforms: use ${headers['key']} not def key = headers.key
// The def binding is local and does NOT survive GString interpolation.
```

---

## 16. Development Phases

### Phase 1 — Core Foundation ✓ COMPLETE

```
✓ Maven multi-module scaffold (esb-spec, esb-compiler, esb-adapters, esb-runtime)
✓ RouteSpec POJOs + Jackson YAML parsing
✓ RouteAssembler (immutable, complete)
✓ RestSourceAdapter, DirectSourceAdapter, TimerSourceAdapter
✓ SoapTargetAdapter, RestTargetAdapter
✓ JoltTransformAdapter, GroovyTransformAdapter, PassthroughTransformAdapter
✓ CorrelationInterceptor, ErrorHandlingInterceptor, RetryInterceptor
✓ ValidationPipeline with L1–L4 rules
✓ LiveRouteRegistry (list, start, stop, reload)
✓ HotReloadWatcher (WatchService → trigger reload on YAML change)
✓ RouteManagementController (/manage/routes full lifecycle)
✓ One end-to-end: REST POST → SOAP mock → JSON response
```

### Phase 2 — Designer + UI ✓ COMPLETE

```
✓ esb-designer service (port 9191): validate, preview, save
✓ TransformPreviewController — test transforms with real data
✓ esb-ui: React + Vite + Tailwind + React Flow
✓ RouteBuilderPage — drag-drop canvas with live YAML editor
✓ JoltFieldMapperModal + GroovySoapMapperModal
✓ AuditInterceptor + AuditStore + AuditController
✓ AuditPage — audit trail in UI
✓ RouteAssemblerFacade + ComplexRouteAssembler (EIP patterns)
✓ Process steps: set-header, log, script, route-to, split, wire-tap
✓ Content-based routing in RouteAssembler
✓ mock-bank-service module (standalone SOAP simulator)
✓ Start/stop scripts at repo root
✓ Spring profiles: demo (default), init, production
✓ HttpLoggedTargetAdapter, MockResponseTargetAdapter, MockEchoTargetAdapter
```

### Phase 3 — Production-Grade (In Progress)

```
Priority 1 — Interceptor chain (fix GAP-003 first):
  □ ResilienceInterceptor — replace ErrorHandling+Retry pair (order=10)
  □ AuthInterceptor — enforce AuthSpec JWT/basic/api-key (order=5)
  □ IdempotentConsumerInterceptor (order=6)
  □ RateLimitInterceptor — token bucket per route (order=8)

Priority 2 — Spec POJOs:
  □ CircuitBreakerSpec, AuditSpec, IdempotencySpec, RateLimitSpec
  □ TlsSpec, OAuthClientSpec (on TargetSpec)
  □ Add to RouteSpec: circuitBreaker, audit, idempotency
  □ Add to SourceSpec: rateLimit
  □ Add to TargetSpec: tls, oauthClient

Priority 3 — Observability:
  □ Micrometer metrics per route (timer, success/error counters)
  □ Dead-letter queue management API: /manage/dlq/**
  □ Route history + metrics: /manage/routes/{name}/history|metrics
  □ Structured JSON logs in production profile (logstash-logback)

Priority 4 — Messaging (T1):
  □ JmsTargetAdapter, JmsSourceAdapter
  □ KafkaTargetAdapter, KafkaSourceAdapter

Priority 5 — Multi-broker:
  □ BrokerIsolationRule (route name must match BROKER_ID prefix)
  □ K8s Helm charts (per-broker namespace)

Priority 6 — Cleanup:
  □ REMOVE MockResponseTargetAdapter + MockEchoTargetAdapter
  □ Hide mock adapters from UI palette (isInternal() flag)
  □ Replace mock-balance-service.yaml with proper simulator route
```

---

## 17. Technology Stack

```
Runtime
  Spring Boot          3.3.4
  Apache Camel         4.7.0    (Camel 4 = Spring Boot 3 native, Jakarta namespace)
  Groovy               3.x      (inline transform scripts)
  Jolt                 0.1.7    (JSON→JSON transform)
  Jackson              2.17.2   (YAML/JSON parsing)
  Java                 17       (minimum for Camel 4.x)

UI
  React                18.x
  Vite                 5.x      (build tool)
  TypeScript           5.x
  Tailwind CSS         3.x
  React Flow           11.x     (canvas drag-drop)
  Axios                (API client)

Observability (current)
  Spring Actuator               (health, metrics endpoints)
  AuditStore                   (in-memory audit events)
  MDC Correlation IDs          (via CorrelationInterceptor)

Observability (Phase 3 target)
  Micrometer           1.13.x   (route metrics)
  logstash-logback     7.4      (structured JSON logs)
  Prometheus scrape             (/actuator/prometheus)

Build
  Maven                3.9.x    (multi-module)
  Parent BOM includes BOTH camel-bom AND camel-spring-boot-bom
  jolt.version=0.1.7 (explicit — jolt-core in esb-adapters)
  App port: 9090 (not 8080 — occupied by mock-bank-service)

Key BOM rule:
  Root pom must declare BOTH:
    camel-bom          (core Camel artifacts)
    camel-spring-boot-bom  (Spring Boot auto-configuration)
  Missing either causes version conflicts at runtime.
```

---

## 18. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| GAP-003: RetryInterceptor never fires | **CONFIRMED** | High | Replace with ResilienceInterceptor (Phase 3 P1) |
| Secrets in YAML committed to Git | High | Critical | `EnvVarResolvableRule` enforces ${VAR} syntax; pre-commit hook blocks literal secrets |
| WSDL changes break routes silently | High | High | Contract test each WSDL in CI; `WsdlOperationExistsRule` on deploy |
| PII leaks in logs | High | Critical | `logBody: false` default; Phase 3 LogMaskingProcessor in interceptor chain |
| Hot-reload drops in-flight requests | Medium | High | Graceful stop: drain in-flight → stop → swap → restart |
| Path conflict between two YAML files | Medium | High | `PathConflictRule` checks all live routes on every deploy |
| RouteAssembler becomes a God class | Low | High | Enforced by architecture: only adapters change; PR gate: no PRs modify RouteAssembler |
| SoapTargetAdapter sends wrong HTTP headers | Medium | High | Must `removeHeader(HTTP_PATH/URI/QUERY)`; `bridgeEndpoint=true` alone is not sufficient |
| Groovy GString binding broken | Medium | Medium | Use `${headers['key']}` — `def key = headers.key` breaks GString interpolation |
| Mock adapters left in production palette | Medium | Medium | Phase 3: add `isInternal()` to TargetAdapter interface; hide from UI |
| Camel version upgrade breaks adapters | Medium | Medium | Pin versions in BOM; upgrade in dedicated branch with full integration test run |

---

## Key Design Decisions Log

| Decision | Alternatives Considered | Why This Choice |
|---|---|---|
| Use Camel catalog as component source | Manual component registry | 300+ components for free; always up to date |
| Specialized + Custom adapter tiers | One adapter per component | Explicit, testable; no magic generic adapter hiding bugs |
| RouteAssembler is immutable | Regenerate per route type | Prevents N×M explosion; single test surface |
| 5-layer validation pipeline | Single validate step | Each layer has different cost; UI can call cheapest layer on each keystroke |
| YAML spec as the contract | Java DSL / UI model | Works with CI, Git, curl, UI equally; language-agnostic |
| DryRun with isolated CamelContext | Static analysis only | Camel's own engine is the validator; catches what static analysis cannot |
| RouteAssemblerFacade injection | Direct RouteAssembler injection | Facade routes to simple or complex assembler; callers unaware of complexity |
| Two assemblers (simple + complex) | One assembler for all patterns | Complex EIP patterns don't pollute the simple linear path |
| AuditStore in-memory | Database / external log | Zero dependency for Phase 2; Phase 3 will add persistence |
| Spring profiles (demo/init/production) | Single application.yaml | Clean separation of dev/demo/prod config; MockSoapController excluded from prod |
