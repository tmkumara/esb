# ESB Platform — Complete Architecture Reference
> Version: 1.0 | Status: Living Document | Stack: Apache Camel 4.x + Spring Boot 3.x

---

## Table of Contents

1. [Vision & Core Principle](#1-vision--core-principle)
2. [The Key Insight: Camel Already Has the Catalog](#2-the-key-insight-camel-already-has-the-catalog)
3. [Full System Architecture](#3-full-system-architecture)
4. [Module Structure](#4-module-structure)
5. [Component Registry Design](#5-component-registry-design)
6. [Three-Tier Adapter Model](#6-three-tier-adapter-model)
7. [Component Tier Rollout Strategy](#7-component-tier-rollout-strategy)
8. [RouteAssembler — The Immutable Core](#8-routeassembler--the-immutable-core)
9. [RouteSpec YAML Reference](#9-routespec-yaml-reference)
10. [Validation Architecture — 5 Layers](#10-validation-architecture--5-layers)
11. [Drag-and-Drop UI Integration](#11-drag-and-drop-ui-integration)
12. [How to Add a New Component](#12-how-to-add-a-new-component)
13. [Development Phases](#13-development-phases)
14. [Technology Stack](#14-technology-stack)
15. [Risk Register](#15-risk-register)

---

## 1. Vision & Core Principle

### What This System Is

A configuration-driven Enterprise Service Bus where:
- Routes are declared as **YAML specs** (human-readable, Git-stored)
- A **compiler** validates and assembles Camel routes from specs
- A **runtime** loads and manages live routes in Spring Boot
- A **UI** (Phase 2+) draws pipelines that emit the same YAML
- **300+ Camel components** are supported without touching core code

### The One Rule That Prevents Mess

```
┌─────────────────────────────────────────────────────────────┐
│              THE CLOSED CORE PRINCIPLE                      │
│                                                             │
│  RouteAssembler     → NEVER changes                         │
│  ValidationPipeline → NEVER changes                         │
│  RouteRegistry      → NEVER changes                         │
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
if (!result.isSuccess()) {
    result.getUnknownParameters();   // Map<String,String> param → error
    result.getInvalidValue();        // Map<String,String> bad type/range
    result.getRequired();            // Set<String>  missing required params
    result.summaryErrorMessage(true); // human-readable summary
}

// ── OFFLINE CATALOG (use for full component palette in UI backend) ───
DefaultCamelCatalog offlineCatalog = new DefaultCamelCatalog(true); // caching=true
List<String> all350 = offlineCatalog.findComponentNames();

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
║  │                        DATA LAYER (Git)                             │    ║
║  │  routes/*.yaml    transforms/*.xslt|*.jolt   wsdl/*.wsdl           │    ║
║  │  components/overrides/*.yaml  (our metadata over Camel catalog)    │    ║
║  └────────────────────────────┬────────────────────────────────────────┘    ║
║                               │ file watch / Git pull                        ║
║  ┌────────────────────────────▼────────────────────────────────────────┐    ║
║  │                     COMPILER LAYER                                  │    ║
║  │                                                                     │    ║
║  │  RouteSpecLoader → RouteSpecValidator → RouteAssembler              │    ║
║  │                         │                    │                      │    ║
║  │              ┌──────────▼──────────┐  ┌──────▼──────────────────┐  │    ║
║  │              │  ValidationPipeline  │  │  ComponentDescriptor    │  │    ║
║  │              │  L1 Structural       │  │  Registry               │  │    ║
║  │              │  L2 Schema           │  │  (Camel Catalog +       │  │    ║
║  │              │  L3 Semantic         │  │   our overlays)         │  │    ║
║  │              │  L4 Compatibility    │  └──────┬──────────────────┘  │    ║
║  │              │  L5 DryRun           │         │                      │    ║
║  │              └──────────────────────┘         │                      │    ║
║  │                                               │                      │    ║
║  │              ┌────────────────────────────────▼──────────────────┐  │    ║
║  │              │              ADAPTER REGISTRIES                    │  │    ║
║  │              │                                                    │  │    ║
║  │              │  SourceAdapters:   rest | grpc | timer | mq | ... │  │    ║
║  │              │  TargetAdapters:   soap | fixml | jms | ftp | ... │  │    ║
║  │              │  TransformAdapters: xslt | jolt | groovy | ...    │  │    ║
║  │              │  InterceptorChain: auth | retry | corr | metrics  │  │    ║
║  │              └────────────────────────────────────────────────────┘  │    ║
║  └────────────────────────────┬────────────────────────────────────────┘    ║
║                               │ assembled RouteBuilder instances             ║
║  ┌────────────────────────────▼────────────────────────────────────────┐    ║
║  │                     RUNTIME LAYER                                   │    ║
║  │                                                                     │    ║
║  │  CamelContext ─── RouteRegistry ─── HotReloadWatcher               │    ║
║  │       │                                                             │    ║
║  │  Live Routes:                                                       │    ║
║  │    customer-lookup  [REST→SOAP]     [RUNNING]                       │    ║
║  │    order-submit     [REST→FIXML]    [RUNNING]                       │    ║
║  │    report-pull      [Timer→FTP]     [RUNNING]                       │    ║
║  └────────────────────────────┬────────────────────────────────────────┘    ║
║                               │                                              ║
║  ┌────────────────────────────▼────────────────────────────────────────┐    ║
║  │                  OBSERVABILITY LAYER                                │    ║
║  │  MDC Correlation IDs │ Micrometer Metrics │ Structured JSON Logs   │    ║
║  └─────────────────────────────────────────────────────────────────────┘    ║
║                                                                              ║
║  ┌─────────────────────────────────────────────────────────────────────┐    ║
║  │                   MANAGEMENT API  (Phase 2)                         │    ║
║  │  GET  /api/components          list available components+metadata   │    ║
║  │  POST /api/validate            validate a RouteSpec (any layer)     │    ║
║  │  GET  /api/routes              list live routes + status            │    ║
║  │  POST /api/routes              deploy a validated spec              │    ║
║  │  PUT  /api/routes/{name}/reload hot-reload a route                  │    ║
║  └─────────────────────────────────────────────────────────────────────┘    ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## 4. Module Structure

```
esb/
│
├── esb-spec/                         ← Pure Java domain model. ZERO Spring.
│   ├── RouteSpec.java                   Top-level spec record
│   ├── SourceSpec.java
│   ├── TargetSpec.java
│   ├── TransformSpec.java
│   ├── RoutingSpec.java               (content-based router, splitter, etc.)
│   ├── ErrorSpec.java
│   ├── RetrySpec.java
│   ├── CorrelationSpec.java
│   └── schema/
│       └── route-spec-v1.json         JSON Schema for YAML validation (L2)
│
├── esb-catalog/                      ← Component Registry + Camel Catalog bridge
│   ├── ComponentDescriptor.java         Our overlay record
│   ├── ParameterDef.java
│   ├── CamelCatalogLoader.java          Loads from camel-catalog artifact
│   ├── ComponentDescriptorRegistry.java Spring bean, @PostConstruct loads all
│   ├── CompatibilityMatrix.java         source-type × target-type rules
│   └── overrides/                       YAML overlays for UI metadata, tiers
│       ├── rest.yaml
│       ├── cxf.yaml
│       ├── jms.yaml
│       └── ...
│
├── esb-compiler/                     ← Validation + Assembly. Thin Spring layer.
│   ├── validation/
│   │   ├── SpecRule.java                interface
│   │   ├── ValidationLayer.java         enum: STRUCTURAL|SCHEMA|SEMANTIC|COMPAT|DRY_RUN
│   │   ├── ValidationContext.java       shared state across rules
│   │   ├── ValidationReport.java
│   │   ├── ValidationPipeline.java      orchestrates all rules in order
│   │   └── rules/
│   │       ├── structural/              RequiredFieldsRule, NameFormatRule, ...
│   │       ├── schema/                  TypeKnownRule, RetryConfigRule, ...
│   │       ├── semantic/                WsdlExistsRule, XsltCompilesRule, ...
│   │       ├── compatibility/           CompatibilityMatrixRule, PathConflictRule
│   │       └── dryrun/                  CamelDryRunRule
│   ├── assembly/
│   │   ├── RouteAssembler.java          THE immutable core
│   │   ├── SourceAdapter.java           interface
│   │   ├── TargetAdapter.java           interface
│   │   ├── TransformAdapter.java        interface
│   │   ├── RouteInterceptor.java        interface
│   │   └── CamelUriBuilder.java         builds URIs from descriptor + params
│   └── dryrun/
│       └── CamelDryRunCompiler.java     isolated CamelContext compile check
│
├── esb-adapters/                     ← All adapter implementations. ADD HERE ONLY.
│   ├── source/
│   │   ├── RestSourceAdapter.java       T0 - core
│   │   ├── TimerSourceAdapter.java      T2 - future
│   │   └── MqSourceAdapter.java         T1 - future
│   ├── target/
│   │   ├── SoapTargetAdapter.java       T0 - core (specialized, needs CXF setup)
│   │   ├── RestTargetAdapter.java       T0 - core
│   │   ├── JmsTargetAdapter.java        T1 - messaging
│   │   ├── KafkaTargetAdapter.java      T1 - messaging
│   │   ├── FixmlTargetAdapter.java      T3 - specialized
│   │   └── FtpTargetAdapter.java        T2 - integration
│   ├── transform/
│   │   ├── XsltTransformAdapter.java    T0 - core
│   │   ├── JoltTransformAdapter.java    T0 - core
│   │   ├── GroovyTransformAdapter.java  T1
│   │   └── PassthroughTransformAdapter T0 - core
│   └── interceptors/
│       ├── CorrelationInterceptor.java  always applied, order=1
│       ├── AuthInterceptor.java         always applied, order=2
│       ├── RetryInterceptor.java        always applied, order=3
│       ├── TimeoutInterceptor.java      always applied, order=4
│       └── MetricsInterceptor.java      always applied, order=5
│
├── esb-runtime/                      ← Spring Boot app. Wires everything together.
│   ├── EsbApplication.java
│   ├── CamelContextConfig.java          Camel + Spring Boot config
│   ├── RouteRegistry.java               manages live routes
│   ├── RouteSpecLoader.java             reads YAML from directory
│   ├── HotReloadWatcher.java            WatchService → trigger reload
│   └── ManagementController.java        /api/routes, /api/validate (Phase 2)
│
├── esb-observability/                ← Cross-cutting. Injected, never hardcoded.
│   ├── CorrelationIdFilter.java         Servlet filter: MDC inject/propagate
│   ├── CamelMetricsStrategy.java        Micrometer route timers/counters
│   ├── StructuredLogLayout.java         Logback JSON encoder config
│   └── HealthIndicator.java             Spring Boot actuator: route health
│
└── esb-api/                          ← Phase 2+. Management REST API.
    └── (placeholder)
```

---

## 5. Component Registry Design

### How It Works

```
startup
   │
   ├─ CamelCatalogLoader.load()
   │    ├─ catalog.findComponentNames()     → [ "cxf", "jms", "kafka", "ftp", ... ]
   │    ├─ for each: catalog.componentJson() → raw Camel JSON
   │    └─ parse → CamelComponentDescriptor (Camel's own model)
   │
   ├─ OverlayLoader.load("classpath:components/overrides/*.yaml")
   │    └─ our metadata: displayName, tier, uiIcon, uiColor, validationRules
   │
   ├─ merge → ComponentDescriptor (our unified model)
   │
   └─ ComponentDescriptorRegistry populated
        ├─ indexed by scheme:    "cxf", "jms", "kafka"
        ├─ indexed by role:      SOURCE, TARGET, BOTH
        └─ indexed by tier:      T0, T1, T2, T3, T4
```

### ComponentDescriptor (our model over Camel's catalog)

```java
public record ComponentDescriptor(
    // from Camel catalog
    String scheme,               // "cxf", "jms", "kafka", "ftp"
    String title,                // "CXF (SOAP)", "JMS", "Kafka"
    String description,
    List<ParameterDef> params,   // all URI + component params from catalog

    // our overlay
    ComponentRole role,          // SOURCE, TARGET, BOTH
    ComponentTier tier,          // T0_CORE, T1_MESSAGING, T2_INTEGRATION, T3_SPECIALIZED
    String uiIcon,               // icon name for drag-drop UI
    String uiColor,              // node color in canvas
    String uriTemplate,          // how to build URI from user params
    List<String> requiredParams, // subset of params that must be set
    List<String> uiVisibleParams // which params to show in property panel
) {}

public record ParameterDef(
    String name,
    String type,          // string | integer | boolean | duration | enum
    String defaultValue,
    boolean required,
    boolean secret,       // mask in UI, never log
    String description,
    List<String> enumValues  // for enum type
) {}
```

### The Override YAML (our metadata layer)

```yaml
# components/overrides/cxf.yaml
scheme: cxf
role: TARGET
tier: T0_CORE
displayName: "SOAP / CXF"
uiIcon: "soap-icon"
uiColor: "#4A90D9"
uriTemplate: "cxf:{endpointAddress}?serviceClass={serviceClass}&wsdlURL={wsdlURL}"
requiredParams:
  - endpointAddress
  - wsdlURL
  - operationName
uiVisibleParams:
  - endpointAddress
  - wsdlURL
  - operationName
  - serviceName
  - portName
validationRules:
  - WsdlExistsRule
  - WsdlOperationExistsRule
  - SoapAuthConfigRule
```

```yaml
# components/overrides/jms.yaml
scheme: jms
role: BOTH                # can be source or target
tier: T1_MESSAGING
displayName: "JMS / ActiveMQ"
uiIcon: "mq-icon"
uiColor: "#F5A623"
uriTemplate: "jms:{destinationType}:{destinationName}"
requiredParams:
  - destinationName
uiVisibleParams:
  - destinationType      # queue | topic
  - destinationName
  - concurrentConsumers
  - acknowledgementMode
validationRules:
  - JmsBrokerReachableRule
  - JmsDestinationFormatRule
```

---

## 6. Three-Tier Adapter Model

Not all components need the same level of custom code. Three tiers of adapter:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ADAPTER TIERS                                    │
│                                                                     │
│  Tier A: GenericCamelAdapter                                        │
│  ────────────────────────────                                       │
│  Works for 80%+ of Camel components.                                │
│  Uses ComponentDescriptor to build URI + pre/post processors.       │
│  Zero custom code needed. Just add an override YAML.                │
│  Examples: HTTP, FTP, File, Timer, Quartz, SFTP                     │
│                                                                     │
│  Tier B: SpecializedAdapter extends GenericCamelAdapter             │
│  ──────────────────────────────────────────────────────             │
│  Overrides specific hooks for complex protocols.                    │
│  Examples: CXF/SOAP (WSDL proxy gen), Kafka (schema registry),      │
│            REST DSL (Spring Boot REST config)                        │
│                                                                     │
│  Tier C: CustomProtocolAdapter implements TargetAdapter             │
│  ──────────────────────────────────────────────────────             │
│  Full custom implementation for proprietary protocols.              │
│  Examples: FIXML (FIX engine session), Bloomberg API, SAP RFC        │
└─────────────────────────────────────────────────────────────────────┘
```

### Tier A: GenericCamelAdapter (the default, covers most cases)

```java
// esb-adapters/target/GenericCamelTargetAdapter.java
@Component
public class GenericCamelTargetAdapter implements TargetAdapter {

    private final ComponentDescriptorRegistry registry;
    private final CamelUriBuilder uriBuilder;
    private final EnvVarResolver envResolver;

    @Override
    public boolean supports(TargetSpec spec) {
        ComponentDescriptor desc = registry.get(spec.type());
        // Generic adapter handles it IF no specialized adapter is registered
        return desc != null && !hasSpecializedAdapter(spec.type());
    }

    @Override
    public String buildToUri(TargetSpec spec) {
        ComponentDescriptor desc = registry.get(spec.type());
        Map<String, String> resolvedParams = envResolver.resolve(spec.params());
        return uriBuilder.build(desc.uriTemplate(), resolvedParams);
    }

    @Override
    public Processor preProcessor(TargetSpec spec) {
        // Generic: set content-type header based on component's expected format
        return exchange -> {
            ComponentDescriptor desc = registry.get(spec.type());
            exchange.getIn().setHeader("Content-Type", desc.defaultContentType());
        };
    }

    @Override
    public Processor postProcessor(TargetSpec spec) {
        return exchange -> { /* generic passthrough */ };
    }
}
```

### Tier B: SpecializedAdapter (for complex protocols)

```java
// Only override what's different. Everything else comes from Generic.
@Component
@Primary // takes priority over GenericCamelTargetAdapter for "soap"
public class SoapTargetAdapter extends GenericCamelTargetAdapter {

    @Override
    public boolean supports(TargetSpec spec) {
        return "soap".equals(spec.type());
    }

    @Override
    public String buildToUri(TargetSpec spec) {
        // CXF URI has specific structure that generic builder can't handle
        return String.format("cxf:%s?wsdlURL=%s&serviceClass=%s&operationName=%s",
            envResolver.resolve(spec.endpoint()),
            spec.wsdl(),
            generateProxyClass(spec),   // CXF-specific: generate from WSDL
            spec.operation()
        );
    }

    @Override
    public Processor preProcessor(TargetSpec spec) {
        return exchange -> {
            // CXF-specific: set operation name header
            exchange.getIn().setHeader(CxfConstants.OPERATION_NAME, spec.operation());
            exchange.getIn().setHeader(CxfConstants.OPERATION_NAMESPACE, spec.namespace());
            // SOAP auth header
            if (spec.auth() != null) applySoapAuth(exchange, spec.auth());
        };
    }

    private String generateProxyClass(TargetSpec spec) {
        // Use CXF wsdl2java to generate proxy, cache result
        return wsdlProxyCache.getOrGenerate(spec.wsdl(), spec.service());
    }
}
```

### Tier C: CustomProtocolAdapter (proprietary protocols)

```java
// For protocols Camel doesn't natively support
@Component
public class FixmlTargetAdapter implements TargetAdapter {

    @Override
    public boolean supports(TargetSpec spec) { return "fixml".equals(spec.type()); }

    @Override
    public String buildToUri(TargetSpec spec) {
        // Could use Camel's netty component as transport,
        // or a custom component registered under "fixml" scheme
        return "netty:tcp://" + spec.endpoint()
            + "?encoders=#fixmlEncoder&decoders=#fixmlDecoder";
    }

    @Override
    public Processor preProcessor(TargetSpec spec) {
        return exchange -> {
            // FIX session headers, sequence numbers, sender/target comp IDs
            exchange.getIn().setHeader("FIX.SenderCompID", spec.param("senderCompId"));
            exchange.getIn().setHeader("FIX.TargetCompID", spec.param("targetCompId"));
        };
    }

    @Override
    public Processor postProcessor(TargetSpec spec) {
        return exchange -> {
            // Parse FIXML ACK/NAK, map to internal response model
        };
    }
}
```

### Adapter Resolution Order (no conflict, no mess)

```
RouteAssembler needs a TargetAdapter for type="soap"

1. Look for @Primary adapter that supports("soap")   → SoapTargetAdapter  ✓ found, use it
2. Look for @Primary adapter that supports("jms")    → not found
3. Fall back to GenericCamelTargetAdapter.supports() → true, use it
4. If GenericCamelTargetAdapter doesn't support it   → throw RouteConfigException
   "No adapter found for target type: 'fixml'. Register a FixmlTargetAdapter."
```

---

## 7. Component Tier Rollout Strategy

Implement in tiers. Each tier is a complete, shippable increment. Never implement
partial tiers.

```
T0 — CORE (Phase 1, Weeks 1-3)
────────────────────────────────
Source:    REST (HTTP inbound via Camel REST DSL)
Target:    SOAP/CXF, REST/HTTP
Transform: XSLT, Jolt, Passthrough
Routing:   Linear (from → transform → to)
Goal:      REST→SOAP works end to end. One real integration live.

T1 — MESSAGING (Phase 2, Month 2)
───────────────────────────────────
Source:    JMS (ActiveMQ/Artemis), Kafka
Target:    JMS, Kafka, RabbitMQ
Routing:   Content-Based Router (choice()), Message Filter
Goal:      Async messaging patterns work. Dead letter queues live.

T2 — INTEGRATION (Phase 2, Month 3)
─────────────────────────────────────
Source:    Timer/Quartz (scheduled), File, SFTP
Target:    FTP/SFTP, File, SMTP (email notifications)
Target:    REST (HTTP outbound) — generic HTTP calls to any REST API
Routing:   Splitter, Aggregator, Wire Tap
Goal:      Batch/scheduled patterns work. File-based integrations live.

T3 — SPECIALIZED (Phase 3, per demand)
────────────────────────────────────────
Source/Target: FIXML, FIX protocol (QuickFIX/J + Camel)
Target:        JDBC (database write), JPA
Target:        gRPC (with Camel gRPC component)
Target:        SAP RFC (Camel SAP component)
Routing:       Dynamic Router, Recipient List
Goal:          Domain-specific protocols live. Driven by project needs.

T4 — COMMUNITY (on demand)
───────────────────────────
Any Camel community component
Add via: 1 override YAML + 1 optional adapter class
GenericCamelAdapter handles most without any code.
```

### Adding Tiers Without Breaking Anything

```
When T1 (Messaging) is ready to implement:

1. Add Maven dependency for camel-jms to esb-adapters/pom.xml
2. Add components/overrides/jms.yaml  (metadata overlay)
3. Add JmsTargetAdapter.java          (or rely on GenericCamelAdapter)
4. Add JmsSourceAdapter.java          (or rely on GenericCamelAdapter)
5. Add JmsBrokerReachableRule.java    (semantic validation)
6. Update CompatibilityMatrix          (jms ↔ rest, jms ↔ soap, etc.)

Files changed in CORE: ZERO
Files changed in esb-compiler: ZERO
Files changed in esb-runtime: ZERO
```

---

## 8. RouteAssembler — The Immutable Core

This class must never be modified after it is written. All extension happens in adapters.

```java
@Component
public class RouteAssembler {

    // All populated by Spring component scan — auto-discovers new adapters
    private final Map<String, SourceAdapter>    sourceAdapters;
    private final Map<String, TargetAdapter>    targetAdapters;
    private final Map<String, TransformAdapter> transformAdapters;
    private final List<RouteInterceptor>        interceptors;    // sorted by order()

    // Entry point — only public method needed
    public RouteBuilder assemble(RouteSpec spec) {
        SourceAdapter    src    = resolve(sourceAdapters,    spec.source().type(),   "source");
        TargetAdapter    tgt    = resolve(targetAdapters,    spec.target().type(),   "target");
        TransformAdapter reqTx  = resolve(transformAdapters, spec.transform().request().type(),  "transform");
        TransformAdapter resTx  = resolve(transformAdapters, spec.transform().response().type(), "transform");

        return new RouteBuilder() {
            @Override
            public void configure() {
                // Step 1: apply interceptors (error handling, retry, auth, metrics)
                interceptors.forEach(i -> i.apply(this, spec));

                // Step 2: build route — always the same shape
                RouteDefinition route = from(src.buildFromUri(spec.source()))
                    .routeId(spec.name())
                    .process(reqTx.buildProcessor(spec.transform().request()))
                    .process(tgt.preProcessor(spec.target()))
                    .to(tgt.buildToUri(spec.target()))
                    .process(tgt.postProcessor(spec.target()))
                    .process(resTx.buildProcessor(spec.transform().response()));

                // Step 3: let source do any extra DSL setup (REST verb, path params)
                src.configure(route, spec.source());

                // Step 4: wire content-based routing if spec has it
                if (spec.routing() != null) {
                    applyRouting(route, spec.routing());
                }
            }
        };
    }

    private void applyRouting(RouteDefinition route, RoutingSpec routing) {
        switch (routing.type()) {
            case CONTENT_BASED -> applyChoiceRouter(route, routing);
            case SPLITTER      -> applySplitter(route, routing);
            case AGGREGATOR    -> applyAggregator(route, routing);
            // new routing patterns added here ONLY — assembler still never changes structure
        }
    }

    private <T> T resolve(Map<String, T> registry, String type, String role) {
        T adapter = registry.get(type);
        if (adapter == null) throw new RouteConfigException(
            "No %s adapter for type '%s'. Available: %s".formatted(
                role, type, registry.keySet()));
        return adapter;
    }
}
```

---

## 9. RouteSpec YAML Reference

### Complete Schema

```yaml
# ── METADATA ─────────────────────────────────────────────────────────
apiVersion: esb/v1
kind: RouteSpec

metadata:
  name: order-submit                 # kebab-case, unique across all routes
  version: "1.0"                     # semver for your own tracking
  description: "POST /orders → FIXML NewOrderSingle"
  tags: [trading, orders]            # for filtering in UI / catalog
  owner: trading-team                # for governance

# ── SOURCE (inbound endpoint) ─────────────────────────────────────────
source:
  type: rest                         # rest | timer | jms | kafka | file | grpc
  method: POST                       # GET | POST | PUT | DELETE | PATCH
  path: /api/v1/orders
  consumes: application/json
  produces: application/json
  auth:
    type: jwt                        # jwt | basic | api-key | none
    requiredRoles: [ROLE_TRADER]
  validation:
    bodySchema: classpath:schema/order-request.json
    pathParams:
      id: { type: string, pattern: "^[A-Z0-9]{8}$" }
    headers:
      X-Account-Id: { required: true }

# ── TARGET (outbound call) ────────────────────────────────────────────
target:
  type: soap                         # soap | fixml | jms | kafka | rest | ftp | file
  # --- SOAP-specific ---
  wsdl: classpath:wsdl/OrderService.wsdl
  service: OrderService
  port: OrderServicePort
  operation: SubmitOrder
  endpointUrl: "${SOAP_ORDER_URL}"   # ALWAYS env var, never hardcoded
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
    retryOn: [CONNECTION_REFUSED, HTTP_503, HTTP_502, TIMEOUT]
    doNotRetryOn: [HTTP_400, HTTP_401, HTTP_403]  # don't retry client errors

# ── TRANSFORMS ────────────────────────────────────────────────────────
transform:
  request:
    type: xslt                       # xslt | jolt | groovy | jsonata | passthrough
    resource: classpath:xslt/order-to-soap.xslt
    # optional: for groovy/script transforms
    # script: |
    #   def body = request.body
    #   ...
  response:
    type: jolt
    resource: classpath:jolt/soap-to-order-response.json

# ── CONTENT-BASED ROUTING (optional) ─────────────────────────────────
routing:
  type: content-based                # content-based | splitter | aggregator | wire-tap
  expressionLanguage: simple         # simple | xpath | jsonpath | groovy
  rules:
    - id: large-order
      condition: "${body.quantity} > 10000"
      target:
        type: jms
        destination: "queue.large-orders"
        endpointUrl: "${JMS_URL}"
      transform:
        response:
          type: passthrough
    - id: standard                   # MUST have exactly one default: true
      default: true
      target:
        type: fixml
        endpointUrl: "${FIXML_HOST}"
      transform:
        response:
          type: xslt
          resource: classpath:xslt/fixml-ack-to-json.xslt

# ── ERROR HANDLING ────────────────────────────────────────────────────
errorHandling:
  deadLetter: direct:global-error-handler
  fallback:
    httpStatus: 503
    contentType: application/json
    body: '{"code":"SERVICE_UNAVAILABLE","message":"Please retry later"}'
  onSoapFault:
    httpStatus: 502
    mapFaultCode: true               # extract SOAP fault code into response

# ── OBSERVABILITY ─────────────────────────────────────────────────────
correlation:
  header: X-Correlation-ID
  generateIfMissing: true
  propagateToTarget: true            # forward to downstream SOAP/REST calls

logging:
  logBody: false                     # NEVER true in production for PII routes
  logHeaders: true
  maskHeaders: [Authorization, X-Api-Key]
  level: INFO

metrics:
  enabled: true
  tags:
    domain: trading
    operation: order-submit
    tier: external
```

---

## 10. Validation Architecture — 5 Layers

### The Pipeline

```java
public class ValidationPipeline {

    private final List<SpecRule> rules;   // all rules injected by Spring

    public ValidationReport validate(RouteSpec spec, ValidationLayer upTo) {
        ValidationContext ctx = new ValidationContext(
            adapterRegistry, env, liveRouteRegistry
        );

        List<ValidationMessage> messages = new ArrayList<>();
        boolean canProceed = true;

        for (ValidationLayer layer : ValidationLayer.values()) {
            if (layer.ordinal() > upTo.ordinal()) break;
            if (!canProceed) break;   // stop at first ERROR layer

            List<SpecRule> layerRules = rules.stream()
                .filter(r -> r.layer() == layer && r.appliesTo(spec))
                .toList();

            for (SpecRule rule : layerRules) {
                ValidationResult result = rule.check(spec, ctx);
                messages.addAll(result.messages());
                if (result.hasFatalError()) { canProceed = false; break; }
            }
        }

        return ValidationReport.of(spec.name(), messages, upTo);
    }
}
```

### All Rules by Layer

```
L1 STRUCTURAL (client-side + server, < 10ms)
  NameFormatRule            name is kebab-case, 1-64 chars, unique in file
  RequiredFieldsRule        source, target, transform present
  HttpMethodRule            method in [GET, POST, PUT, DELETE, PATCH]
  RetryConfigRule           maxAttempts 1–10, delays positive integers
  TimeoutRule               connectMs < readMs, both > 0
  RoutingDefaultRule        content-based routing has exactly one default branch

L2 SCHEMA (server, < 10ms)
  SourceTypeKnownRule       type is in ComponentDescriptorRegistry
  TargetTypeKnownRule       type is in ComponentDescriptorRegistry
  TransformTypeKnownRule    type in [xslt, jolt, groovy, jsonata, passthrough]
  EnumValuesRule            all enum fields match allowed values from descriptor
  ConditionSyntaxRule       routing condition expressions parse without error

L3 SEMANTIC (server, 100ms–2s, results cached)
  WsdlExistsRule            wsdl file/URL loads and is valid XML
  WsdlOperationExistsRule   operation name exists in WSDL port
  XsltCompilesRule          XSLT file loads and Saxon compiles it
  XsltSchemaCompatRule      XSLT input namespace matches WSDL schema namespace
  JoltSpecValidRule         Jolt spec JSON is valid and parses
  EnvVarResolvableRule      all ${VAR} references exist in environment/config
  AuthResourceRule          JWT: issuer set. Basic: credentials set.
  TransformResourceRule     all resource: classpath:... files exist

L4 COMPATIBILITY (server, < 50ms)
  SourceTargetCompatRule    compatibility matrix check
  TransformFormatRule       if target=soap, request transform output must be XML
  AuthPropagationRule       if source needs auth, target auth configured
  PathConflictRule          no two live routes on same method+path
  RoutingBranchCompatRule   each routing branch passes SourceTargetCompatRule

L5 DRY_RUN (server, 1–5s)
  CamelDryRunRule           builds route in isolated CamelContext
                            catches: bad URIs, missing beans, circular routes,
                                     invalid expressions, component errors
```

### DryRun Compiler Detail

```java
@Component
public class CamelDryRunCompiler {

    public DryRunResult compile(RouteSpec spec) {
        DefaultCamelContext dryCtx = new DefaultCamelContext();
        dryCtx.setAutoStartup(false);    // never actually starts
        dryCtx.disableJMX();

        try {
            // Register mock components so Camel accepts the URIs
            // without trying to open real connections
            registerMockComponents(dryCtx, spec);

            RouteBuilder builder = assembler.assemble(spec);
            dryCtx.addRoutes(builder);

            // This validates the entire route graph:
            // - URI structure and parameters
            // - Expression language syntax
            // - Route graph connectivity
            // - Bean reference resolution
            dryCtx.build();

            return DryRunResult.success(
                dryCtx.getRoutes().stream()
                    .map(r -> new RouteInfo(r.getId(), r.getEndpoint().getEndpointUri()))
                    .toList()
            );
        } catch (FailedToCreateRouteException e) {
            return DryRunResult.failure("Route build failed: " + e.getMessage());
        } catch (ResolveEndpointFailedException e) {
            return DryRunResult.failure(
                "Bad endpoint URI: " + e.getUri() + " — " + e.getMessage()
            );
        } finally {
            try { dryCtx.close(); } catch (Exception ignored) {}
        }
    }

    private void registerMockComponents(CamelContext ctx, RouteSpec spec) {
        // Replace real protocol components with mocks for validation only
        Set<String> schemes = extractSchemes(spec);
        schemes.forEach(scheme ->
            ctx.addComponent(scheme, new MockComponent(ctx))
        );
    }
}
```

---

## 11. Drag-and-Drop UI Integration

### What the UI Does (and Does Not Do)

```
UI RESPONSIBILITY                        SERVER RESPONSIBILITY
────────────────                         ─────────────────────
Draw nodes (from ComponentDescriptor)    Validate WSDL exists
Render property panels                   Compile XSLT
Basic field format checks                Check env vars
Build RouteSpec JSON/YAML               Run DryRun compiler
Send to /api/validate                   Manage live routes
Display ValidationReport                Hot-reload
Never talk to Camel directly            Write to Git
Never call WSDL URLs                    Enforce path conflicts
```

### UI ↔ Server API Contract

```
GET  /api/components
     → List<ComponentDescriptor>   (what to show in the component palette)
     → grouped by tier, role

POST /api/validate
     body: RouteSpec JSON
     query: ?level=STRUCTURAL|SCHEMA|SEMANTIC|COMPATIBILITY|DRY_RUN
     → ValidationReport { errors[], warnings[], hints[], dryRunDetails }

POST /api/routes
     body: RouteSpec JSON
     → requires DRY_RUN validation to have passed
     → deploys route to live CamelContext
     → writes YAML to Git
     → returns RouteStatus

GET  /api/routes
     → List<RouteStatus> { name, status, specVersion, uptime, metrics }

PUT  /api/routes/{name}/reload
     → hot-reload without restart

DELETE /api/routes/{name}
     → graceful stop + deregister
```

### Validation Trigger Flow in UI

```
User action                    API call                 Debounce
─────────────────────────────────────────────────────────────────
Type in any field            → /validate?level=STRUCTURAL   100ms
Drop a source component      → /validate?level=COMPAT        50ms
Drop a target component      → /validate?level=COMPAT        50ms
Upload WSDL/XSLT file        → /validate?level=SEMANTIC   immediate
Click "Validate All"         → /validate?level=DRY_RUN    immediate (show spinner)
Click "Deploy"               → POST /api/routes           (DRY_RUN must have passed)
```

### ValidationReport Response (displayed in UI)

```json
{
  "specName": "order-submit",
  "layerReached": "DRY_RUN",
  "passed": false,
  "errors": [
    {
      "ruleId": "WSDL_OPERATION_EXISTS",
      "layer": "SEMANTIC",
      "field": "target.operation",
      "message": "Operation 'SubmitOrderV2' not found. Available: [SubmitOrder, CancelOrder]",
      "suggestion": "Did you mean 'SubmitOrder'?",
      "severity": "ERROR"
    }
  ],
  "warnings": [
    {
      "ruleId": "RETRY_SOAP_FAULT",
      "layer": "COMPATIBILITY",
      "message": "SOAP_FAULT not in retryOn list. Add if your operation is idempotent.",
      "severity": "WARNING"
    }
  ],
  "hints": [
    {
      "ruleId": "LOG_BODY_DISABLED",
      "message": "logBody is false. Enable temporarily for debugging, disable in production.",
      "severity": "HINT"
    }
  ]
}
```

---

## 12. How to Add a New Component

### The Checklist (follow every time — no exceptions)

```
Step 1: Check if GenericCamelAdapter covers it
  □ Does the component have a straightforward URI? (scheme:address?params)
  □ No custom session management or protocol handshake?
  □ No proprietary library beyond camel-xxx dependency?
  → YES to all: skip to Step 3. No Java code needed.
  → NO to any: write a SpecializedAdapter (Step 2)

Step 2: Write adapter (only if needed)
  □ Create esb-adapters/target/{Name}TargetAdapter.java
  □ Implement TargetAdapter (or extend GenericCamelTargetAdapter)
  □ Annotate @Component
  □ Override only buildToUri, preProcessor, postProcessor as needed
  □ Write unit test with mock CamelContext

Step 3: Add component override YAML
  □ Create esb-catalog/src/main/resources/components/overrides/{scheme}.yaml
  □ Set: scheme, role, tier, displayName, uiIcon, uiColor
  □ Set: uriTemplate, requiredParams, uiVisibleParams
  □ Set: validationRules list (reference existing or new rule classes)

Step 4: Add semantic validation rule (if needed)
  □ Create esb-compiler/validation/rules/semantic/{Name}ExistsRule.java
  □ Implement SpecRule, set layer = ValidationLayer.SEMANTIC
  □ annotate @Component
  □ Write unit test

Step 5: Update compatibility matrix
  □ Open CompatibilityMatrix.java
  □ Add row/column entry for new scheme
  □ Define valid source↔target combinations

Step 6: Add Maven dependency
  □ Add camel-{component} to esb-adapters/pom.xml

Step 7: Test
  □ Unit test: adapter builds correct URI from sample spec
  □ Integration test: end-to-end route with mock endpoint
  □ DryRun test: CamelDryRunCompiler accepts the assembled route

Step 8: Document
  □ Add entry to docs/COMPONENTS.md
  □ Add example YAML to docs/examples/{scheme}-example.yaml
```

---

## 13. Development Phases

### Phase 1 — Core Foundation (Weeks 1–3)

```
Week 1: Skeleton + T0 Source/Target
  □ Maven multi-module scaffold
  □ RouteSpec POJOs + Jackson YAML parsing
  □ RouteAssembler (immutable, complete)
  □ RestSourceAdapter
  □ SoapTargetAdapter (CXF)
  □ XsltTransformAdapter + JoltTransformAdapter
  □ All 5 interceptors wired
  □ One end-to-end test: REST POST → SOAP stub → JSON response
  ✓ DoD: curl to REST endpoint, SOAP mock returns, JSON comes back

Week 2: Validation + Production Basics
  □ ValidationPipeline with all L1–L4 rules
  □ DryRunCompiler (L5)
  □ WsdlExistsRule, XsltCompilesRule, EnvVarResolvableRule
  □ CompatibilityMatrix (T0 components)
  □ CorrelationIdFilter (MDC)
  □ Micrometer metrics (route timer, success/error counters)
  □ Structured JSON logging
  □ Global error handler → clean JSON error responses
  □ Retry + timeout from spec
  ✓ DoD: SOAP down → 503 JSON with correlation ID. Retry works. p99 < 2s at 100rps.

Week 3: Registry + Hot Reload
  □ CamelCatalogLoader (load Camel catalog at startup)
  □ ComponentDescriptor + override YAML loader
  □ RouteRegistry (list, start, stop, reload)
  □ HotReloadWatcher (FileWatcher → reload on YAML change)
  □ /actuator/esb/routes endpoint
  □ Full integration test suite
  □ CI pipeline with DRY_RUN validation on commit
  ✓ DoD: Edit YAML without restart → new route live within 5s

### Phase 2 — Messaging + Management API (Month 2)

  □ T1 components: JMS, Kafka
  □ Management REST API (/api/components, /api/validate, /api/routes)
  □ Content-Based Router support in RouteAssembler
  □ Phase-2 UI: React canvas (consumes /api/components, calls /api/validate)
  □ Git write-back (deploy → write YAML to Git branch)

### Phase 3 — Specialized + UI Polish (Month 3+)

  □ T2: Timer, File, SFTP, HTTP(outbound)
  □ T3: FIXML, JDBC, gRPC (demand-driven)
  □ Splitter, Aggregator routing patterns
  □ Schema registry integration (Kafka Avro)
  □ Route versioning (spec v1 → v2 migration)
```

---

## 14. Technology Stack

```
Runtime
  Spring Boot          3.3.x
  Apache Camel         4.7.x    (Camel 4 = Spring Boot 3 native)
  Apache CXF           4.0.x    (SOAP/WSDL)
  Saxon HE             12.x     (XSLT 3.0 processor)
  Jolt                 0.1.x    (JSON→JSON transform)

Observability
  Micrometer           1.13.x   (metrics)
  logstash-logback     7.4      (structured JSON logs)
  Spring Actuator               (health, metrics endpoints)

Catalog & Validation
  camel-catalog        4.7.x    (built-in component metadata — key dependency)
  Jackson Dataformat YAML       (YAML parsing)
  json-schema-validator         (L2 JSON Schema validation)
  Hibernate Validator           (bean validation in POJOs)

Testing
  JUnit 5
  AssertJ
  Mockito
  Camel Test Kit (camel-test-spring-junit5)
  WireMock                      (mock SOAP/REST targets in tests)
  Testcontainers                (real JMS/Kafka in integration tests)

Build
  Maven 3.9.x          (multi-module)
  Checkstyle           (enforce code style)
  SpotBugs             (static analysis)
  JaCoCo               (coverage gate: min 80%)
```

---

## 15. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Camel catalog metadata incomplete for some components | Medium | Medium | Override YAML supplements catalog; custom descriptors for edge cases |
| WSDL changes break existing routes silently | High | High | Contract test each WSDL in CI; version WSDLs in Git; `WsdlOperationExistsRule` on deploy |
| DryRun compiler gives false positives (mock too permissive) | Medium | Medium | Integration tests always run against real components in CI; DryRun is a safety net, not sole gate |
| Hot-reload drops in-flight requests | Medium | High | Graceful stop: drain in-flight → stop → swap → restart; configurable drain timeout |
| Secrets in YAML committed to Git | High | Critical | `EnvVarResolvableRule` enforces ${VAR} syntax; pre-commit hook blocks literal secrets; secret scanning in CI |
| RouteAssembler becomes a God class | Low | High | Enforced by architecture: only adapters change; PR review gate: no PRs that modify RouteAssembler |
| PII leaks in logs | High | Critical | `logBody: false` default; LogMaskingProcessor in interceptor chain; log review in security audit |
| Path conflict between two YAML files | Medium | High | `PathConflictRule` checks all live routes on every deploy |
| GenericAdapter silently builds wrong URI | Medium | Medium | Every adapter has URI-build unit test; DryRun catches resolution failures |
| Camel version upgrade breaks adapters | Medium | Medium | Pin versions in BOM; upgrade in dedicated branch with full integration test run |

---

## Key Design Decisions Log

| Decision | Alternatives Considered | Why This Choice |
|---|---|---|
| Use Camel catalog as component source | Manual component registry | 300+ components for free; always up to date |
| Generic + Specialized + Custom adapter tiers | One adapter per component | 80% coverage with zero code; custom only where needed |
| RouteAssembler is immutable | Regenerate per route type | Prevents N×M explosion; single test surface |
| 5-layer validation pipeline | Single validate step | Each layer has different cost; UI can call cheapest layer on each keystroke |
| YAML spec as the contract | Java DSL / UI model | Works with CI, Git, curl, UI equally; language-agnostic |
| DryRun with isolated CamelContext | Static analysis only | Camel's own engine is the validator; catches what static analysis cannot |
| Override YAML for UI metadata | Hardcode in Java | Non-developer can extend component catalog; no recompile needed |
