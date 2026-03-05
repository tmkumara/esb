# Complex Route Patterns — Implementation Guide

> This document covers every non-trivial routing pattern, how it maps to a YAML spec,
> how the RouteAssembler generates it, and how it looks on the UI canvas.

---

## Table of Contents

1. [How Complex Routes Compose](#1-how-complex-routes-compose)
2. [Pattern: Content-Based Router](#2-pattern-content-based-router)
3. [Pattern: Splitter → Aggregator](#3-pattern-splitter--aggregator)
4. [Pattern: Enricher Chain](#4-pattern-enricher-chain)
5. [Pattern: Multi-Hop Pipeline (Routes calling Routes)](#5-pattern-multi-hop-pipeline-routes-calling-routes)
6. [Pattern: Wire-Tap (Parallel Audit)](#6-pattern-wire-tap-parallel-audit)
7. [Pattern: Saga / Distributed Transaction](#7-pattern-saga--distributed-transaction)
8. [Pattern: Async Request-Reply](#8-pattern-async-request-reply)
9. [Pattern: Dynamic Router](#9-pattern-dynamic-router)
10. [Real-World Scenario: Trading Order End-to-End](#10-real-world-scenario-trading-order-end-to-end)
11. [RouteAssembler: How Each Pattern Is Generated](#11-routeassembler-how-each-pattern-is-generated)
12. [Cross-Route Reference Validation](#12-cross-route-reference-validation)

---

## 1. How Complex Routes Compose

All complex routes are built from the same three blocks:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EVERY ROUTE IS:                                  │
│                                                                     │
│  SOURCE → [PROCESS STEPS] → [ROUTING] → TARGET                     │
│                                                                     │
│  PROCESS STEPS: ordered pipeline of small operations               │
│  ROUTING: how/where the message goes after steps                   │
│  TARGET: where the final call is made                               │
│                                                                     │
│  Complex = more steps + nested routing + routes calling routes     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key principle: routes are composable via `direct:`.**
A big complex flow is split into multiple named routes.
Each route does one thing well. They chain together through `direct:route-name`.

```
REST inbound
     │
     ▼
Route A: validate + enrich          (via direct:validate-and-enrich)
     │
     ▼
Route B: classify + route by type   (via direct:classify-order)
     │              │
     ▼              ▼
Route C: FIXML    Route D: JMS     (leaf routes — do the actual calls)
```

This means:
- Each route is independently testable
- Each route can be hot-reloaded without touching others
- The UI renders each route as a separate canvas tab, linked by `direct:` edges
- The Validator checks that all `direct:` targets actually exist in the registry

---

## 2. Pattern: Content-Based Router

### What it is
One message, multiple possible destinations. Decision based on message content,
headers, or properties. The most common complex pattern.

### The YAML

```yaml
apiVersion: esb/v1
kind: RouteSpec

metadata:
  name: order-router
  description: "Route orders to correct destination based on type and amount"

source:
  type: rest
  method: POST
  path: /api/v1/orders

process:
  steps:
    - id: validate-schema
      type: validate
      schema: classpath:schema/order.json

    - id: set-order-class
      type: set-header
      name: X-Order-Class
      expression:
        language: simple
        value: "${body.amount} > 1000000 ? 'LARGE' : 'STANDARD'"

routing:
  type: content-based
  rules:

    - id: large-equity
      condition:
        language: simple
        value: "${header.X-Order-Class} == 'LARGE' && ${body.orderType} == 'EQUITY'"
      steps:
        - type: log
          message: "Large equity order ${body.orderId} → manual approval"
          level: WARN
      target:
        type: jms
        destination: "queue.large-equity-manual"
        endpointUrl: "${JMS_URL}"

    - id: equity
      condition:
        language: simple
        value: "${body.orderType} == 'EQUITY'"
      steps:
        - type: set-header
          name: X-Venue
          expression: { language: constant, value: "LSE" }
      target:
        type: fixml
        endpointUrl: "${FIXML_EQUITY_HOST}"

    - id: fx
      condition:
        language: simple
        value: "${body.orderType} == 'FX'"
      target:
        type: soap
        wsdl: classpath:wsdl/FxGateway.wsdl
        operation: SubmitFxOrder
        endpointUrl: "${SOAP_FX_URL}"

    - id: unknown                   # MUST have exactly one default
      default: true
      steps:
        - type: log
          message: "Unknown order type ${body.orderType} — dead-lettering"
          level: ERROR
      target:
        type: jms
        destination: "queue.unroutable"
        endpointUrl: "${JMS_URL}"

errorHandling:
  deadLetter: direct:global-error-handler

correlation:
  header: X-Correlation-ID
  generateIfMissing: true
```

### How RouteAssembler Generates This

```java
// RouteAssembler.applyRouting() → ContentBasedRouterAssembler
private void applyContentBasedRouting(RouteDefinition route, RoutingSpec routing) {

    ChoiceDefinition choice = route.choice();

    for (RoutingRule rule : routing.rules()) {

        if (rule.isDefault()) continue;  // handle last

        // When clause
        WhenDefinition when = choice.when(
            buildExpression(rule.condition())    // language + value → Predicate
        );

        // Optional pre-steps inside this branch
        if (rule.steps() != null) {
            for (StepSpec step : rule.steps()) {
                stepAdapterRegistry.get(step.type()).apply(when, step);
            }
        }

        // Target for this branch
        TargetAdapter tgt = targetAdapters.get(rule.target().type());
        when.process(tgt.preProcessor(rule.target()))
            .to(tgt.buildToUri(rule.target()))
            .process(tgt.postProcessor(rule.target()));
    }

    // Default/otherwise branch
    RoutingRule defaultRule = routing.rules().stream()
        .filter(RoutingRule::isDefault).findFirst().orElseThrow();

    OtherwiseDefinition otherwise = choice.otherwise();
    if (defaultRule.steps() != null) {
        defaultRule.steps().forEach(s ->
            stepAdapterRegistry.get(s.type()).apply(otherwise, s));
    }
    TargetAdapter defaultTgt = targetAdapters.get(defaultRule.target().type());
    otherwise.process(defaultTgt.preProcessor(defaultRule.target()))
             .to(defaultTgt.buildToUri(defaultRule.target()))
             .process(defaultTgt.postProcessor(defaultRule.target()));

    choice.end();
}
```

### UI Canvas

```
┌──────────────────────────────────────────────────────────────────────────┐
│  REST POST /api/v1/orders                                                │
│          │                                                               │
│          ▼                                                               │
│  [validate-schema] ──▶ [set-order-class]                                 │
│          │                                                               │
│          ▼                                                               │
│     ┌────┴─────────────────────────┐                                     │
│     │       CONTENT ROUTER         │                                     │
│     ├──────────────────────────────┤                                     │
│     │ LARGE && EQUITY  ────────────┼──▶ [log WARN] ──▶ JMS queue.large  │
│     │ EQUITY           ────────────┼──▶ [set-header]──▶ FIXML LSE       │
│     │ FX               ────────────┼──────────────────▶ SOAP FX Gateway │
│     │ DEFAULT          ────────────┼──▶ [log ERROR]──▶ JMS unroutable   │
│     └──────────────────────────────┘                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Pattern: Splitter → Aggregator

### What it is
One inbound message contains a collection (e.g., batch of orders).
Split into N individual messages, process each (possibly in parallel),
collect all N results, assemble one response back to the caller.

### The YAML

```yaml
apiVersion: esb/v1
kind: RouteSpec

metadata:
  name: batch-order-submit
  description: "POST batch of orders → split → submit each → aggregate → return"

source:
  type: rest
  method: POST
  path: /api/v1/orders/batch

process:
  steps:

    - id: validate-batch
      type: validate
      schema: classpath:schema/order-batch.json

    - id: split-orders
      type: split
      expression:
        language: jsonpath
        value: "$.orders"          # split on this array
      parallelProcessing: true     # process all splits concurrently
      timeout: 60000               # total time budget for all splits
      stopOnException: false       # continue other splits if one fails
      streaming: false             # collect all results (not streaming)

      # steps run INSIDE each split — on each individual order
      steps:
        - id: enrich-inventory
          type: enrich
          source: direct:inventory-check    # lookup route
          aggregationStrategy: merge-into-body
          timeout: 3000

        - id: classify-item
          type: set-header
          name: X-Item-Status
          expression:
            language: simple
            value: "${body.available} ? 'AVAILABLE' : 'BACKORDER'"

        - id: submit-one
          type: route-to
          destination: direct:submit-single-order   # handles the actual SOAP call

      # how to combine the N individual results into one
      aggregation:
        strategy: collect-to-array      # collect | merge | first | last | collect-to-array
        completionSize: expression      # when to stop: all splits done
        resultKey: results              # put array at body.results
        timeoutMs: 55000

    - id: build-batch-response
      type: script
      language: groovy
      inline: |
        def results = exchange.in.body.results
        def succeeded = results.count { it.status == 'OK' }
        def failed = results.count { it.status != 'OK' }
        exchange.in.body = [
            total: results.size(),
            succeeded: succeeded,
            failed: failed,
            results: results
        ]

# No top-level target — each split route-to handles its own target
# The aggregator produces the final response body
```

### The Sub-Route Called per Split

```yaml
apiVersion: esb/v1
kind: RouteSpec
metadata:
  name: submit-single-order          # called via direct:submit-single-order

source:
  type: direct                       # internal — not REST-exposed
  name: submit-single-order

transform:
  request:
    type: xslt
    resource: classpath:xslt/order-to-soap.xslt
  response:
    type: jolt
    resource: classpath:jolt/soap-ack-to-result.json

target:
  type: soap
  wsdl: classpath:wsdl/OrderService.wsdl
  operation: SubmitOrder
  endpointUrl: "${SOAP_ORDER_URL}"
  retry:
    maxAttempts: 2
    retryOn: [CONNECTION_REFUSED, HTTP_503]

errorHandling:
  fallback:
    httpStatus: 200            # don't fail the batch — return error in body
    body: '{"status":"ERROR","orderId":"${body.orderId}","reason":"${exception.message}"}'
```

### How RouteAssembler Generates This

```java
// StepAdapter for "split"
@Component
public class SplitStepAdapter implements StepAdapter {

    @Override
    public String type() { return "split"; }

    @Override
    public void apply(RouteDefinition route, StepSpec spec) {
        Expression splitExp = buildExpression(spec.expression());

        SplitDefinition split = route
            .split(splitExp)
            .parallelProcessing(spec.parallelProcessing())
            .timeout(spec.timeout())
            .stopOnException(spec.stopOnException())
            .aggregationStrategy(buildAggregationStrategy(spec.aggregation()));

        // Apply nested steps inside the split
        if (spec.steps() != null) {
            for (StepSpec nested : spec.steps()) {
                stepAdapterRegistry.get(nested.type()).apply(split, nested);
            }
        }

        split.end();
    }
}
```

### UI Canvas

```
┌───────────────────────────────────────────────────────────────────────────┐
│  REST POST /api/v1/orders/batch                                           │
│       │                                                                   │
│       ▼                                                                   │
│  [validate-batch]                                                         │
│       │                                                                   │
│       ▼                                                                   │
│  ┌────┴──────────────────────────────────────────────────────────────┐   │
│  │  SPLITTER  $.orders[]   [parallel=true]  [timeout=60s]            │   │
│  │     │                                                             │   │
│  │     ├─── order[0] ──▶ [enrich-inventory] ─▶ [classify] ─▶ direct:│   │
│  │     ├─── order[1] ──▶ [enrich-inventory] ─▶ [classify] ─▶ direct:│   │
│  │     └─── order[n] ──▶ [enrich-inventory] ─▶ [classify] ─▶ direct:│   │
│  │                                                                   │   │
│  │  AGGREGATOR  strategy=collect-to-array                            │   │
│  └────────────────────────────────────────────────────────────────── ┘   │
│       │                                                                   │
│       ▼                                                                   │
│  [build-batch-response]  ──▶  REST response                               │
└───────────────────────────────────────────────────────────────────────────┘

                              ↓ (each split calls)
┌───────────────────────────────────────┐
│  direct:submit-single-order           │
│  [XSLT req] → SOAP → [Jolt res]       │
└───────────────────────────────────────┘
```

---

## 4. Pattern: Enricher Chain

### What it is
One message needs data from multiple sources before it can be processed.
Each `enrich` step calls another route (which may call a REST API, DB, cache, etc.)
and merges the result back into the main message.

### The YAML

```yaml
apiVersion: esb/v1
kind: RouteSpec

metadata:
  name: customer-onboarding
  description: "POST new customer → enrich from 3 services → submit to CRM"

source:
  type: rest
  method: POST
  path: /api/v1/customers

process:
  steps:

    # Step 1: validate incoming payload
    - id: validate-input
      type: validate
      schema: classpath:schema/customer.json

    # Step 2: enrich with fraud score (external API)
    # If fraud service is down, continue with default (don't fail onboarding)
    - id: fraud-check
      type: enrich
      source: direct:fraud-score-lookup
      aggregationStrategy: merge-property    # merge result into exchange property
      property: fraudScore
      timeout: 2000
      onTimeout: use-default                 # continue | fail | use-default
      defaultValue: "{ \"score\": 0.0, \"status\": \"UNKNOWN\" }"

    # Step 3: credit bureau (hard dependency — fail if down)
    - id: credit-score
      type: enrich
      source: direct:credit-bureau-lookup
      aggregationStrategy: merge-into-body   # merge result fields into body
      timeout: 5000
      onTimeout: fail

    # Step 4: conditional — only check KYC if credit score is sufficient
    - id: kyc-gate
      type: choice
      when:
        - condition:
            language: jsonpath
            value: "$.creditScore >= 500"
          steps:
            - id: kyc-check
              type: enrich
              source: direct:kyc-status-lookup
              aggregationStrategy: merge-into-body
              timeout: 3000
              onTimeout: continue
      otherwise:
        steps:
          - type: set-header
            name: X-Onboarding-Status
            expression: { language: constant, value: "CREDIT_REJECTED" }
          - type: route-to
            destination: direct:rejection-handler

    # Step 5: final decision — set status header from enriched data
    - id: determine-status
      type: script
      language: groovy
      inline: |
        def body    = exchange.in.body
        def fraud   = exchange.getProperty("fraudScore", Map)
        def status  = (fraud?.score > 0.7) ? "MANUAL_REVIEW"
                    : (body.creditScore < 500) ? "REJECTED"
                    : "APPROVED"
        exchange.in.setHeader("X-Onboarding-Status", status)

transform:
  request:
    type: jolt
    resource: classpath:jolt/customer-to-crm.json
  response:
    type: jolt
    resource: classpath:jolt/crm-response-to-api.json

target:
  type: soap
  wsdl: classpath:wsdl/CrmService.wsdl
  operation: CreateCustomer
  endpointUrl: "${CRM_SOAP_URL}"
  retry:
    maxAttempts: 3
    retryOn: [CONNECTION_REFUSED, TIMEOUT]
```

### The Lookup Sub-Routes (thin, reusable)

```yaml
# direct:fraud-score-lookup
apiVersion: esb/v1
kind: RouteSpec
metadata:
  name: fraud-score-lookup
source:
  type: direct
  name: fraud-score-lookup
process:
  steps:
    - type: set-header
      name: customerId
      expression: { language: jsonpath, value: "$.customerId" }
target:
  type: rest
  method: GET
  path: "/fraud/score/${header.customerId}"
  endpointUrl: "${FRAUD_API_URL}"
  timeout: { connectMs: 1000, readMs: 2000 }
```

```yaml
# direct:credit-bureau-lookup — same pattern, different endpoint
apiVersion: esb/v1
kind: RouteSpec
metadata:
  name: credit-bureau-lookup
source:
  type: direct
  name: credit-bureau-lookup
target:
  type: soap
  wsdl: classpath:wsdl/CreditBureau.wsdl
  operation: GetCreditScore
  endpointUrl: "${CREDIT_BUREAU_URL}"
```

### UI Canvas

```
┌─────────────────────────────────────────────────────────────────────────┐
│  REST POST /api/v1/customers                                            │
│       │                                                                 │
│       ▼                                                                 │
│  [validate] ──▶ [enrich:fraud] ──▶ [enrich:credit] ──▶ [choice:kyc]   │
│                      │                   │                   │         │
│                      │    2s timeout      │    5s / fail      ├─ score≥500 ──▶ [enrich:kyc]
│                      │    default=0.0     │                   └─ else   ──▶ [rejection]
│                      ▼                   ▼                             │
│  direct:fraud-lookup  │    direct:credit-lookup                         │
│  (REST external)      │    (SOAP CreditBureau)     [determine-status]  │
│                       │                                 │               │
│                       └─────────────────────────────────▼               │
│                                                    [Jolt transform]     │
│                                                    SOAP CRM.CreateCustomer│
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Pattern: Multi-Hop Pipeline (Routes calling Routes)

### What it is
A long business process broken into stages.
Each stage is its own route — testable, reloadable, independently monitored.
They chain via `direct:` — synchronous, in the same JVM thread.

### Why break into multiple routes?
- Each route has its own retry, timeout, error handler
- Partial failure is isolatable — stage 2 failing doesn't retry stage 1
- Each stage shows as a separate metric, separately alertable
- Hot-reload one stage without touching others

### The YAML (each route in its own file)

```yaml
# routes/order-ingress.yaml
# Stage 1: Validate, enrich, decide
apiVersion: esb/v1
kind: RouteSpec
metadata:
  name: order-ingress
source:
  type: rest
  method: POST
  path: /api/v1/orders
process:
  steps:
    - type: validate
      schema: classpath:schema/order.json
    - type: enrich
      source: direct:account-lookup
      aggregationStrategy: merge-into-body
      timeout: 3000
    - type: set-header
      name: X-Pipeline-Stage
      expression: { language: constant, value: "INGRESS_COMPLETE" }
# Hand off to next stage — no target, just route to next stage
routing:
  type: direct
  destination: order-risk-check       # → direct:order-risk-check
```

```yaml
# routes/order-risk-check.yaml
# Stage 2: Risk assessment
apiVersion: esb/v1
kind: RouteSpec
metadata:
  name: order-risk-check
source:
  type: direct
  name: order-risk-check
process:
  steps:
    - type: enrich
      source: direct:risk-engine
      aggregationStrategy: merge-property
      property: riskResult
      timeout: 5000
    - type: choice
      when:
        - condition:
            language: simple
            value: "${exchangeProperty.riskResult.decision} == 'REJECT'"
          steps:
            - type: route-to
              destination: direct:order-rejection
        - condition:
            language: simple
            value: "${exchangeProperty.riskResult.decision} == 'MANUAL'"
          steps:
            - type: route-to
              destination: direct:manual-review-queue
      otherwise:
        steps:
          - type: set-header
            name: X-Pipeline-Stage
            expression: { language: constant, value: "RISK_APPROVED" }
routing:
  type: direct
  destination: order-execution
```

```yaml
# routes/order-execution.yaml
# Stage 3: Execute the order
apiVersion: esb/v1
kind: RouteSpec
metadata:
  name: order-execution
source:
  type: direct
  name: order-execution
transform:
  request:
    type: xslt
    resource: classpath:xslt/order-to-fixml.xslt
  response:
    type: xslt
    resource: classpath:xslt/fixml-ack-to-json.xslt
target:
  type: fixml
  endpointUrl: "${FIXML_URL}"
  retry:
    maxAttempts: 3
    retryOn: [CONNECTION_REFUSED, TIMEOUT]
```

### UI Canvas (multi-tab, connected by direct: edges)

```
TAB: order-ingress              TAB: order-risk-check       TAB: order-execution
─────────────────               ─────────────────────       ────────────────────
REST POST /api/v1/orders        direct:order-risk-check     direct:order-execution
     │                               │                           │
[validate]                      [enrich:risk-engine]        [XSLT req transform]
     │                               │                           │
[enrich:account-lookup]         [choice: decision]          FIXML endpoint
     │                               │                           │
[set-header: stage]             ├── REJECT ──▶ direct:rejection
     │                          ├── MANUAL ──▶ direct:manual-queue
     └──▶ direct:order-risk-check└── default ──▶ direct:order-execution

                        ← links shown as arrows between tabs in UI →
```

### RouteRegistry: how `direct:` routes are wired

```java
// When source.type == "direct", the route exposes via direct: not REST
@Component
public class DirectSourceAdapter implements SourceAdapter {

    @Override
    public String protocol() { return "direct"; }

    @Override
    public String buildFromUri(SourceSpec spec) {
        return "direct:" + spec.name();   // e.g. "direct:order-risk-check"
    }

    @Override
    public void configure(RouteDefinition route, SourceSpec spec) {
        // No extra DSL needed for direct: — it's just an internal endpoint
    }
}

// When routing.type == "direct", route to another internal route
@Component
public class DirectRoutingAssembler implements RoutingAssembler {
    @Override
    public String type() { return "direct"; }

    @Override
    public void apply(RouteDefinition route, RoutingSpec spec) {
        route.to("direct:" + spec.destination());
    }
}
```

### Validation: direct: reference check

```java
// L4 Compatibility rule — runs on all routes after all specs are loaded
@Component
public class DirectReferenceRule implements SpecRule {

    @Override
    public ValidationLayer layer() { return ValidationLayer.COMPATIBILITY; }

    @Override
    public ValidationResult check(RouteSpec spec, ValidationContext ctx) {
        Set<String> defined = ctx.allDirectRouteNames();  // all source.type=direct names
        Set<String> referenced = collectDirectReferences(spec);  // all direct: targets
        Set<String> missing = Sets.difference(referenced, defined);

        if (missing.isEmpty()) return ValidationResult.ok();

        return ValidationResult.errors(missing.stream()
            .map(name -> "direct:" + name + " referenced but no route defines it")
            .toList()
        );
    }
}
```

---

## 6. Pattern: Wire-Tap (Parallel Audit)

### What it is
Main message flow continues. A copy is sent to a secondary route
(audit log, metrics enricher, notification system) without blocking the main flow.

### The YAML

```yaml
process:
  steps:

    # Fire-and-forget copy to audit log — does NOT block
    - id: audit-tap
      type: wire-tap
      destination: direct:audit-log
      copyExchange: true              # deep copy — changes to tap don't affect main
      executorService: audit-pool     # separate thread pool

    # Fire-and-forget copy to analytics
    - id: analytics-tap
      type: wire-tap
      destination: direct:analytics-ingest
      copyExchange: true

    # Main flow continues immediately after wire-taps
    - id: main-transform
      type: map
      mappings:
        - from: body.orderId
          to: body.reference
```

### The Audit Sub-Route

```yaml
apiVersion: esb/v1
kind: RouteSpec
metadata:
  name: audit-log
source:
  type: direct
  name: audit-log
process:
  steps:
    - type: remove-headers
      pattern: "Authorization"        # never log auth headers
    - type: marshal
      format: json
    - type: set-header
      name: X-Audit-Timestamp
      expression: { language: simple, value: "${date:now:yyyy-MM-dd'T'HH:mm:ss.SSSZ}" }
target:
  type: kafka
  topic: "esb.audit.events"
  endpointUrl: "${KAFKA_BOOTSTRAP}"
  producerConfig:
    acks: "1"
    retries: "3"
```

### UI Canvas

```
REST POST /api/v1/orders
     │
     ├──(wire-tap, async)──▶ direct:audit-log     ──▶ Kafka audit topic
     │
     ├──(wire-tap, async)──▶ direct:analytics-ingest ──▶ Kafka analytics
     │
     ▼  (main flow continues without waiting)
[main-transform] ──▶ [SOAP target]
```

---

## 7. Pattern: Saga / Distributed Transaction

### What it is
Multiple steps across different services that must all succeed.
If any step fails, all previously-completed steps are compensated (rolled back).

```
step 1: Reserve inventory     compensation: Release inventory
step 2: Charge payment        compensation: Refund payment
step 3: Create order (FIXML)  compensation: Cancel order
step 4: Send confirmation     compensation: Send cancellation notice
```

### The YAML

```yaml
apiVersion: esb/v1
kind: RouteSpec
metadata:
  name: place-order-saga

source:
  type: rest
  method: POST
  path: /api/v1/orders/place

routing:
  type: saga
  propagation: REQUIRED              # REQUIRED | REQUIRES_NEW | MANDATORY | SUPPORTS | NOT_SUPPORTED
  completionMode: AUTO               # AUTO | MANUAL
  timeout: 60000                     # saga must complete within 60s

  steps:

    - id: reserve-inventory
      description: "Reserve items in warehouse"
      target:
        type: soap
        wsdl: classpath:wsdl/Inventory.wsdl
        operation: ReserveStock
        endpointUrl: "${INVENTORY_URL}"
      compensation:
        description: "Release reserved stock if saga fails"
        target:
          type: soap
          wsdl: classpath:wsdl/Inventory.wsdl
          operation: ReleaseStock
          endpointUrl: "${INVENTORY_URL}"
        preserveHeaders: [X-Reservation-Id]   # need this to compensate

    - id: charge-payment
      description: "Charge the customer"
      target:
        type: rest
        method: POST
        endpointUrl: "${PAYMENT_URL}/charge"
      compensation:
        description: "Refund the charge"
        target:
          type: rest
          method: POST
          endpointUrl: "${PAYMENT_URL}/refund"
        preserveHeaders: [X-Payment-Id]

    - id: create-fixml-order
      description: "Submit order to exchange via FIXML"
      target:
        type: fixml
        endpointUrl: "${FIXML_URL}"
      compensation:
        description: "Send CancelOrderSingle"
        target:
          type: fixml
          endpointUrl: "${FIXML_URL}"
        transform:
          request:
            type: xslt
            resource: classpath:xslt/order-to-cancel-fixml.xslt

    - id: send-confirmation
      description: "Notify customer"
      target:
        type: jms
        destination: "queue.order.confirmations"
        endpointUrl: "${JMS_URL}"
      compensation:
        description: "Send cancellation notice"
        target:
          type: jms
          destination: "queue.order.cancellations"
          endpointUrl: "${JMS_URL}"

errorHandling:
  onSagaFailure:
    httpStatus: 409
    body: '{"status":"SAGA_FAILED","message":"Order placement failed and was rolled back"}'
```

### How RouteAssembler Generates This

```java
// Camel 4.x has built-in Saga EIP
@Component
public class SagaRoutingAssembler implements RoutingAssembler {

    @Override
    public String type() { return "saga"; }

    @Override
    public void apply(RouteDefinition route, RoutingSpec sagaSpec) {

        // Start saga context
        SagaDefinition saga = route.saga()
            .propagation(SagaPropagation.valueOf(sagaSpec.propagation()))
            .completionMode(SagaCompletionMode.valueOf(sagaSpec.completionMode()))
            .timeout(sagaSpec.timeout(), TimeUnit.MILLISECONDS);

        for (SagaStepSpec step : sagaSpec.steps()) {
            // Compensation route is auto-generated as a separate direct: route
            String compensationRoute = "direct:compensate-" + step.id();
            generateCompensationRoute(step);

            // Main step target
            TargetAdapter tgt = targetAdapters.get(step.target().type());

            saga.option("reservation-" + step.id(),
                        simple("${header.X-" + step.id() + "-Id}"))
                .compensation(compensationRoute)
                .process(tgt.preProcessor(step.target()))
                .to(tgt.buildToUri(step.target()))
                .process(tgt.postProcessor(step.target()));
        }

        saga.end();
    }

    private void generateCompensationRoute(SagaStepSpec step) {
        // Auto-generate a compensation route for each step
        // This is a separate Camel route: direct:compensate-{stepId}
        RouteSpec compensationSpec = RouteSpec.builder()
            .name("compensate-" + step.id())
            .source(SourceSpec.direct("compensate-" + step.id()))
            .target(step.compensation().target())
            .transform(step.compensation().transform())
            .build();
        camelContext.addRoutes(assembler.assemble(compensationSpec));
    }
}
```

### UI Canvas

```
┌───────────────────────────────────────────────────────────────────────┐
│  REST POST /api/v1/orders/place                                       │
│        │                                                              │
│        ▼                                                              │
│  ┌─────┴───────────────────────────────────────────────────────────┐ │
│  │                    SAGA (timeout: 60s)                          │ │
│  │                                                                 │ │
│  │  Step 1: SOAP ReserveStock ←─ compensation: SOAP ReleaseStock   │ │
│  │          │                                                       │ │
│  │  Step 2: REST /charge      ←─ compensation: REST /refund        │ │
│  │          │                                                       │ │
│  │  Step 3: FIXML NewOrderSingle ←─ compensation: FIXML CancelOrder│ │
│  │          │                                                       │ │
│  │  Step 4: JMS confirmations ←─ compensation: JMS cancellations   │ │
│  │                                                                  │ │
│  │  If any step fails → compensations run in REVERSE ORDER         │ │
│  └──────────────────────────────────────────────────────────────── ┘ │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 8. Pattern: Async Request-Reply

### What it is
REST caller sends a request. The ESB fires it asynchronously to a JMS queue
(or Kafka topic). A separate consumer route processes it and puts the response
on a reply queue. The ESB correlates the reply back to the original HTTP request.

Use when: target system is async by nature (trading systems, batch processors).

### The YAML

```yaml
apiVersion: esb/v1
kind: RouteSpec
metadata:
  name: async-order-submit

source:
  type: rest
  method: POST
  path: /api/v1/orders/async

asyncReply:
  enabled: true
  requestChannel:
    type: jms
    destination: "queue.order.requests"
    endpointUrl: "${JMS_URL}"
  replyChannel:
    type: jms
    destination: "queue.order.replies"
    endpointUrl: "${JMS_URL}"
  correlationIdHeader: JMSCorrelationID    # set by ESB on send, matched on receive
  replyTimeout: 30000                      # wait up to 30s for reply
  onTimeout:
    httpStatus: 202
    body: '{"status":"ACCEPTED","message":"Order queued for processing","correlationId":"${header.JMSCorrelationID}"}'

transform:
  request:
    type: jolt
    resource: classpath:jolt/order-to-jms-message.json
  response:
    type: jolt
    resource: classpath:jolt/jms-reply-to-api-response.json

process:
  steps:
    - type: set-header
      name: JMSExpiration
      expression: { language: constant, value: "60000" }   # message TTL
```

### How RouteAssembler Generates This

```java
@Component
public class AsyncReplyRoutingAssembler implements RoutingAssembler {

    @Override
    public String type() { return "async-reply"; }

    @Override
    public void apply(RouteDefinition route, RouteSpec spec) {
        AsyncReplySpec asyncSpec = spec.asyncReply();

        // Build the request JMS URI with reply-to config
        String requestUri = "jms:" + asyncSpec.requestChannel().destination()
            + "?replyTo=" + asyncSpec.replyChannel().destination()
            + "&requestTimeout=" + asyncSpec.replyTimeout()
            + "&correlationProperty=" + asyncSpec.correlationIdHeader();

        // The route sends to JMS with built-in request-reply:
        // Camel sets JMSCorrelationID, sends to request queue,
        // waits on reply queue with matching correlation ID
        route
            .process(exchange -> {
                // Ensure correlation ID exists
                if (exchange.getIn().getHeader("JMSCorrelationID") == null) {
                    exchange.getIn().setHeader("JMSCorrelationID",
                        UUID.randomUUID().toString());
                }
            })
            .to(requestUri);  // Camel handles the async request-reply blocking
    }
}
```

### UI Canvas

```
REST POST /api/v1/orders/async
      │
      ▼
[Jolt transform: order → JMS message]
      │
      ▼
JMS queue.order.requests ──▶ (async, waits up to 30s for reply)
                                    │
                        [downstream processor handles it]
                                    │
                                    ▼
                        JMS queue.order.replies
                        (matched by JMSCorrelationID)
                                    │
                                    ▼
[Jolt transform: JMS reply → API response]
      │
      ▼
REST response   OR   timeout → 202 ACCEPTED
```

---

## 9. Pattern: Dynamic Router

### What it is
The routing destination is not fixed in the YAML — it is computed at runtime
from the message content. Useful when the list of possible destinations grows
without redeploying routes.

```yaml
routing:
  type: dynamic
  expression:
    language: groovy
    value: |
      def region = exchange.in.getHeader("X-Region")
      def service = exchange.in.body.serviceCode
      // looks up routing table from a config map or database
      return routingTableService.resolve(region, service)
      // returns: "direct:us-east-handler" or "direct:eu-handler" etc.
```

### RouteAssembler generation

```java
@Component
public class DynamicRoutingAssembler implements RoutingAssembler {
    @Override
    public String type() { return "dynamic"; }

    @Override
    public void apply(RouteDefinition route, RoutingSpec spec) {
        route.dynamicRouter(
            buildExpression(spec.expression())   // expression returns next URI
        );
    }
}
```

---

## 10. Real-World Scenario: Trading Order End-to-End

**Business requirement:**
> A trader submits an order via mobile app (REST).
> If the account is valid and risk approved:
>   - Large orders (>£1M) → manual approval queue, fire audit event
>   - Small equity orders → FIXML to exchange
>   - FX orders → SOAP FX gateway
>   - All orders → wire-tap to audit trail
> Return a correlation ID immediately. Final status comes via WebSocket later.

**This combines: enricher chain + content-based router + wire-tap + async reply**

```
routes/
  order-ingest.yaml          ← REST entry, validate, enrich account
  order-risk-assess.yaml     ← enrich risk score, decide APPROVE/MANUAL/REJECT
  order-route-decision.yaml  ← content-based routing by type+size
  order-large-equity.yaml    ← manual approval JMS queue
  order-equity-fixml.yaml    ← FIXML to exchange
  order-fx-soap.yaml         ← SOAP FX gateway
  order-audit.yaml           ← wire-tap target, kafka audit
  account-lookup.yaml        ← direct: sub-route, REST call
  risk-engine.yaml           ← direct: sub-route, SOAP risk service
```

**Route 1: Ingest** — validates, enriches, hands off

```yaml
# order-ingest.yaml
metadata:
  name: order-ingest
source:
  type: rest
  method: POST
  path: /api/v1/orders
process:
  steps:
    - type: validate
      schema: classpath:schema/order.json
    - type: wire-tap                         # audit every received order
      destination: direct:order-audit
      copyExchange: true
    - type: enrich
      source: direct:account-lookup
      aggregationStrategy: merge-into-body
      timeout: 3000
      onTimeout: fail                        # hard dependency
    - type: set-header
      name: X-Account-Validated
      expression: { language: constant, value: "true" }
routing:
  type: direct
  destination: order-risk-assess
```

**Route 2: Risk** — enriches risk score, routes on decision

```yaml
# order-risk-assess.yaml
metadata:
  name: order-risk-assess
source:
  type: direct
  name: order-risk-assess
process:
  steps:
    - type: enrich
      source: direct:risk-engine
      aggregationStrategy: merge-property
      property: riskDecision
      timeout: 4000
      onTimeout: use-default
      defaultValue: '{"decision":"APPROVE","score":0}'

    - type: choice
      when:
        - condition:
            language: simple
            value: "${exchangeProperty.riskDecision.decision} == 'REJECT'"
          steps:
            - type: set-header
              name: X-Rejection-Reason
              expression: { language: simple, value: "${exchangeProperty.riskDecision.reason}" }
            - type: route-to
              destination: direct:order-rejection

      otherwise:
        steps:
          - type: set-header
            name: X-Risk-Score
            expression: { language: simple, value: "${exchangeProperty.riskDecision.score}" }

routing:
  type: direct
  destination: order-route-decision
```

**Route 3: Decision** — content-based routing by type and size

```yaml
# order-route-decision.yaml
metadata:
  name: order-route-decision
source:
  type: direct
  name: order-route-decision
process:
  steps:
    - type: set-header
      name: X-Order-Size
      expression:
        language: simple
        value: "${body.amount} > 1000000 ? 'LARGE' : 'STANDARD'"
routing:
  type: content-based
  rules:
    - id: large-equity
      condition:
        language: simple
        value: "${header.X-Order-Size} == 'LARGE' && ${body.orderType} == 'EQUITY'"
      target:
        type: jms
        destination: "queue.manual-approval"
        endpointUrl: "${JMS_URL}"

    - id: standard-equity
      condition:
        language: simple
        value: "${body.orderType} == 'EQUITY'"
      target:
        type: fixml
        endpointUrl: "${FIXML_EQUITY_URL}"

    - id: fx
      condition:
        language: simple
        value: "${body.orderType} == 'FX'"
      target:
        type: soap
        wsdl: classpath:wsdl/FxGateway.wsdl
        operation: SubmitFxOrder
        endpointUrl: "${SOAP_FX_URL}"

    - default: true
      target:
        type: jms
        destination: "queue.unroutable"
        endpointUrl: "${JMS_URL}"
```

### Full Canvas (multi-route view)

```
REST POST /api/v1/orders
      │
      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ order-ingest                                                        │
│ [validate] → (wire-tap: audit) → [enrich:account] → direct:risk    │
└─────────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ order-risk-assess                                                   │
│ [enrich:risk-engine]                                                │
│   ├── REJECT  → direct:order-rejection                             │
│   └── APPROVE → [set-header:risk-score] → direct:order-route-decision│
└─────────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────────┐
│ order-route-decision                                                │
│ [set-header:order-size]                                             │
│ CONTENT ROUTER:                                                     │
│   LARGE && EQUITY  ────────────────────────────▶ JMS manual-approval│
│   EQUITY           ──────────────────────────── ▶ FIXML exchange    │
│   FX               ──────────────────────────── ▶ SOAP FX gateway   │
│   DEFAULT          ──────────────────────────── ▶ JMS unroutable    │
└─────────────────────────────────────────────────────────────────────┘

        ↓ (wire-tap target, always running async)
┌────────────────────────────┐
│ order-audit                │
│ [remove-headers:Auth] →    │
│ Kafka: esb.audit.events    │
└────────────────────────────┘
```

---

## 11. RouteAssembler: How Each Pattern Is Generated

```java
// The assembler's routing dispatch — clean switch, never grow RouteAssembler itself
private void applyRouting(RouteDefinition route, RouteSpec spec) {
    if (spec.routing() == null) return;  // linear route — no routing block needed

    RoutingAssembler assembler = routingAssemblers.get(spec.routing().type());
    if (assembler == null) throw new RouteConfigException(
        "No routing assembler for type: " + spec.routing().type()
            + ". Available: " + routingAssemblers.keySet());

    assembler.apply(route, spec);
}

// RoutingAssembler — a fourth registry, same pattern as Source/Target/Transform
public interface RoutingAssembler {
    String type();                                       // matches routing.type in YAML
    void apply(RouteDefinition route, RouteSpec spec);
}

// Implementations — one per pattern, all @Component
// ContentBasedRoutingAssembler   type = "content-based"
// SplitterRoutingAssembler       type = "splitter"        (delegates to SplitStepAdapter)
// SagaRoutingAssembler           type = "saga"
// AsyncReplyRoutingAssembler     type = "async-reply"
// DirectRoutingAssembler         type = "direct"
// DynamicRoutingAssembler        type = "dynamic"
```

---

## 12. Cross-Route Reference Validation

When routes reference each other via `direct:`, validation checks they all exist.

```java
// Runs at startup and on every hot-reload
// Also runs during /api/validate?level=COMPATIBILITY for any new spec
@Component
public class CrossRouteValidator {

    public List<ValidationMessage> validateAll(List<RouteSpec> allSpecs) {
        Set<String> defined = allSpecs.stream()
            .filter(s -> "direct".equals(s.source().type()))
            .map(s -> s.source().name())
            .collect(Collectors.toSet());

        // Also add REST route names (reachable by their name, not just path)
        allSpecs.forEach(s -> defined.add(s.name()));

        List<ValidationMessage> errors = new ArrayList<>();

        for (RouteSpec spec : allSpecs) {
            collectDirectReferences(spec).forEach(ref -> {
                if (!defined.contains(ref)) {
                    errors.add(ValidationMessage.error(
                        "DIRECT_REF_NOT_FOUND",
                        "Route '%s' references direct:%s — not defined in any route spec"
                            .formatted(spec.name(), ref)
                    ));
                }
            });
        }

        return errors;
    }

    // Recursively collect all direct: references from a spec
    private Set<String> collectDirectReferences(RouteSpec spec) {
        Set<String> refs = new HashSet<>();
        if (spec.routing() != null) {
            if ("direct".equals(spec.routing().type()))
                refs.add(spec.routing().destination());
            if ("content-based".equals(spec.routing().type()))
                spec.routing().rules().forEach(r ->
                    collectFromSteps(r.steps(), refs));
        }
        if (spec.process() != null)
            collectFromSteps(spec.process().steps(), refs);
        return refs;
    }

    private void collectFromSteps(List<StepSpec> steps, Set<String> refs) {
        if (steps == null) return;
        for (StepSpec step : steps) {
            if ("route-to".equals(step.type())) refs.add(step.destination());
            if ("enrich".equals(step.type()) && step.source().startsWith("direct:"))
                refs.add(step.source().substring(7));
            if ("wire-tap".equals(step.type()) && step.destination().startsWith("direct:"))
                refs.add(step.destination().substring(7));
            // Recurse into choice branches
            if ("choice".equals(step.type())) {
                step.when().forEach(w -> collectFromSteps(w.steps(), refs));
                collectFromSteps(step.otherwise(), refs);
            }
            if ("split".equals(step.type()))
                collectFromSteps(step.steps(), refs);
        }
    }
}
```

### Summary Table

| Pattern | YAML key | Camel DSL | Key validation rule |
|---|---|---|---|
| Content-Based Router | `routing.type: content-based` | `.choice().when()` | `AtLeastOneDefaultRule` |
| Splitter | `steps[].type: split` | `.split().parallelProcessing()` | `SplitExpressionRule` |
| Aggregator | inside split block | `.aggregate()` | `AggregationStrategyRule` |
| Enricher | `steps[].type: enrich` | `.enrich()` | `EnrichSourceExistsRule` |
| Multi-hop | `routing.type: direct` + `source.type: direct` | `direct:name` | `DirectReferenceRule` |
| Wire-Tap | `steps[].type: wire-tap` | `.wireTap()` | `WireTapDestExistsRule` |
| Saga | `routing.type: saga` | `.saga()` | `SagaCompensationRule` |
| Async Reply | `asyncReply.enabled: true` | `.to("jms:...?replyTo=...")` | `AsyncReplyChannelRule` |
| Dynamic Router | `routing.type: dynamic` | `.dynamicRouter(exp)` | `ExpressionSyntaxRule` |
