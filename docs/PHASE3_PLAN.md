# Phase 3 — Production-Grade ESB Platform

## Context

Phase 1 delivered the core runtime (REST/SOAP adapters, Jolt/Groovy transforms, hot-reload, 5-layer validation, Designer/Runtime split).
Phase 2 delivered complex EIP patterns (CBR, split, wire-tap, set-header, script, log steps).

**The problem:** The architectural bones are solid (A-grade) but the implementation is C+-grade for production.
7 CRITICAL gaps block any production traffic, 8 HIGH gaps required within 6 months, zero tests.
The `AuthSpec` POJO has been parsed and ignored for two phases — auth enforcement is entirely decorative.

**The intent:** Transform the POC into a production-grade showcase fintech ESB covering all verticals
(trading/FIX, payments/SWIFT, API gateway) deployable to Kubernetes for two real broker customers (Saudi, Kuwait).

---

## Confirmed Architecture Decisions

- Two broker customers: Saudi Broker + Kuwait Broker, each isolated K8s namespace
- esb-designer is dev-time only tool (also K8s deployable, to a `dev` namespace)
- Offshore developers add new routes by dropping YAML files to a PVC mount — no restart, hot-reload handles it
- Future new Camel components = new runtime JAR + Docker image rebuild, YAML specs unchanged
- All CRITICAL gaps addressed in parallel (Sprint 1)
- Multi-broker isolation: YAML naming + K8s namespace separation + per-broker route prefix

---

## Multi-Broker Production Architecture

### Kubernetes Namespace Layout

```
k8s cluster
├── namespace: esb-saudi
│   ├── Deployment: esb-runtime      (2 replicas, HA)
│   ├── Service: esb-runtime-svc
│   ├── Ingress: esb-saudi-ingress   (TLS termination)
│   ├── Deployment: esb-ui           (nginx, monitor-only mode)
│   ├── ConfigMap: saudi-initial-routes
│   └── PVC: saudi-routes-pvc        (/opt/esb/routes/saudi/)
│
├── namespace: esb-kuwait
│   ├── Deployment: esb-runtime      (2 replicas, HA)
│   ├── Ingress: esb-kuwait-ingress  (TLS termination)
│   ├── Deployment: esb-ui           (nginx, monitor-only mode)
│   └── PVC: kuwait-routes-pvc       (/opt/esb/routes/kuwait/)
│
└── namespace: esb-dev
    ├── Deployment: esb-runtime      (1 replica, init profile)
    ├── Deployment: esb-designer     (1 replica, port 9191)
    ├── Deployment: esb-ui           (nginx, full designer mode)
    ├── Deployment: keycloak
    ├── Deployment: kafka
    ├── Deployment: postgres
    └── PVC: dev-routes-pvc          (/opt/esb/routes/dev/)
```

### Route Delivery Workflow (Offshore Developers)

```
Write YAML → Validate locally (POST /manage/routes/validate)
    → kubectl cp to PVC mount
    → HotReloadWatcher detects (ENTRY_CREATE, <2s)
    → Route auto-deployed without restart
    → Monitor UI shows new route
```

### YAML Naming Convention (enforced by BrokerIsolationRule)

- Saudi routes:  `broker-sa-{routeName}` (e.g., `broker-sa-order-submit`)
- Kuwait routes: `broker-kw-{routeName}` (e.g., `broker-kw-payment-normalize`)
- Dev routes:    `broker-dev-{routeName}`
- Routes without broker prefix fail validation and are rejected at deploy

### Env Vars per Broker (Helm values)

```yaml
# values-saudi.yaml
env:
  BROKER_ID: broker-sa
  KAFKA_BROKERS: kafka.esb-saudi:9092
  ESB_JWKS_URI: https://keycloak.saudi.example.com/realms/esb/protocol/openid-connect/certs

# values-kuwait.yaml
env:
  BROKER_ID: broker-kw
  KAFKA_BROKERS: kafka.esb-kuwait:9092
  ESB_JWKS_URI: https://keycloak.kuwait.example.com/realms/esb/protocol/openid-connect/certs
```

---

## Critical Bug Found (GAP-003 — Fix First in Sprint 1)

`ErrorHandlingInterceptor` (order=10) registers `onException(Exception.class)` — catch-all.
`RetryInterceptor` (order=30) registers specific handlers AFTER.
Camel evaluates `onException` in registration order → catch-all fires first → **retry never fires**.

**Fix:** Replace both with unified `ResilienceInterceptor` (order=10) with correct exception hierarchy.

---

## Final Interceptor Order Map

| Order | Class | Responsibility |
|---|---|---|
| 1 | AuditInterceptor | Immutable audit record on entry+exit |
| 5 | AuthInterceptor | JWT / API-key / OAuth2 enforcement |
| 6 | IdempotentConsumerInterceptor | Duplicate message detection |
| 8 | RateLimitInterceptor | Per-route throttle (HTTP 429 on breach) |
| 10 | ResilienceInterceptor | Circuit breaker + retry + DLQ (replaces Error+Retry) |
| 20 | CorrelationInterceptor | X-Correlation-ID generation + MDC + propagation |
| 50 | MetricsInterceptor | Custom Micrometer counters + histograms |

---

## Workstream Summary

### Workstream A — Resilience Stack [CRITICAL, Sprint 1]

**Delete:** `ErrorHandlingInterceptor`, `RetryInterceptor`
**Create:**
- `ResilienceInterceptor.java` (order=10) — exception hierarchy fix + circuit breaker + retry + DLQ
- `DlqPublisher.java` (interface), `KafkaDlqPublisher.java`, `JdbcDlqPublisher.java`
- `GlobalErrorHandlerRoute.java` — `direct:global-error-handler`
- `CircuitBreakerSpec.java` in esb-spec
- Add `circuitBreaker` field to `RouteSpec`

**New deps:** `camel-resilience4j-starter`

**Graceful shutdown** (application-production.yaml):
```yaml
server.shutdown: graceful
spring.lifecycle.timeout-per-shutdown-phase: 30s
```

---

### Workstream B — Security Stack [CRITICAL, Sprint 1]

**Create:**
- `SecurityConfig.java` — `/manage/**` requires ESB_ADMIN role; `/api/**` permit-all at Spring level
- `AuthInterceptor.java` (order=5) — reads `spec.source.auth.type`: none/jwt/api-key/basic
- `ApiKeyRegistry.java` — loaded from `esb.security.api-keys` list in application.yaml
- `TokenManager.java` — OAuth2 client credentials grant for outbound calls, token cache+auto-refresh
- `RateLimitInterceptor.java` (order=8) — reads `spec.source.rateLimit`, `.throttle().timePeriodMillis()`
- `RateLimitSpec.java`, `TlsSpec.java`, `OAuthClientSpec.java` in esb-spec
- Add `rateLimit` to `SourceSpec`, `tls`+`oauthClient` to `TargetSpec`

**New deps (esb-runtime):** `spring-boot-starter-security`, `spring-boot-starter-oauth2-resource-server`

---

### Workstream C — Observability Stack [CRITICAL+HIGH, Sprint 1-2]

**Create:**
- `logback-spring.xml` — production profile: LogstashEncoder JSON; others: pattern layout
  - MDC fields: `correlationId`, `routeName`, `brokerId`, `traceId`, `spanId`
- `MetricsInterceptor.java` (order=50)
  - `esb.requests.total{route, broker, status}` counter
  - `esb.request.duration{route, broker}` histogram (P50/P95/P99)
  - `esb.active.routes.count` gauge
  - `esb.dlq.messages.total{route, broker}` counter
- `RouteHealthIndicator.java` — pings each route's target, returns DEGRADED if unreachable

**New deps:** `camel-opentelemetry-starter`

---

### Workstream D — Kubernetes Production Deployment [Sprint 2]

**Create:**
- `Dockerfile` — multi-stage, eclipse-temurin:17 JRE
- `helm/esb-runtime/` — Chart.yaml, values.yaml, templates/
  - deployment.yaml: liveness/readiness probes, PVC mount, envFrom secretRef
  - pvc.yaml: ReadWriteMany
  - configmap.yaml: initial route YAMLs
  - hpa.yaml: scale on CPU > 70%
  - ingress.yaml: TLS termination
- `helm/values-saudi.yaml`, `helm/values-kuwait.yaml`, `helm/values-dev.yaml`
- `helm/esb-designer/` — separate chart, dev namespace only
- `.github/workflows/ci.yml` — build → test → docker-build → helm-deploy-dev → integration-test
- `.github/workflows/security-scan.yml` — OWASP dep check + Trivy

---

### Workstream E — Protocol Expansion: Fintech Adapters [HIGH, Sprint 2-3]

**Create (all in esb-adapters, @Component, auto-discovered):**
- `KafkaSourceAdapter.java` (protocol: kafka) — topic, brokers, groupId
- `KafkaTargetAdapter.java` (protocol: kafka-out)
- `JmsSourceAdapter.java` (protocol: jms)
- `JmsTargetAdapter.java` (protocol: jms-out)
- `SftpSourceAdapter.java` (protocol: sftp) — polling, move=.done
- `SftpTargetAdapter.java` (protocol: sftp-out) — upload
- `FixSourceAdapter.java` (protocol: fix) — QuickFIX/J, converts tags to headers
- `FixTargetAdapter.java` (protocol: fix-out)
- `SwiftMtTransformAdapter.java` (type: swift-mt) — MT103/MT202/MT515 → JSON, MT→MX

**Validation rules (esb-compiler):**
- `KafkaSourceValidationRule.java` — requires topic + brokers
- `FixSourceValidationRule.java` — requires QuickFIX config path

**New deps (esb-adapters):** camel-kafka-starter, camel-jms-starter, camel-sftp-starter, camel-fix-starter, artemis-jms-client, prowide-core

---

### Workstream F — Governance & Audit [HIGH, Sprint 2-3]

**Create:**
- `AuditSpec.java` — enabled, maskFields (List), samplingRate (0.0-1.0)
- `AuditInterceptor.java` (order=1) — entry+exit, SHA-256 hash (never raw payload), PII masking
- `AuditStore.java` (interface), `KafkaAuditStore.java`, `JdbcAuditStore.java`
- `IdempotencySpec.java` — enabled, keyExpression, repositoryType (enum), expireAfterSeconds
- `IdempotentConsumerInterceptor.java` (order=6) — redis/jdbc/memory backends
- `BrokerIsolationRule.java` (STRUCTURAL) — enforces `^(broker-sa|broker-kw|broker-dev)-[a-z0-9-]+$`
- `RouteDeploymentHistory.java` — YAML snapshot on each deploy; `GET /manage/routes/{name}/history`

**Add to RouteSpec:** `audit`, `idempotency` fields

---

### Workstream G — Showcase Route YAMLs [Sprint 3]

Saudi Broker:
- `broker-sa-account-balance.yaml` — REST GET → SOAP → Jolt
- `broker-sa-swift-payment.yaml` — REST POST → Jolt → swift-mt → mock ACK

Kuwait Broker:
- `broker-kw-account-balance.yaml`
- `broker-kw-trade-order.yaml` — REST POST → CBR on orderType (market/limit/stop) → REST OMS mock

Dev showcase:
- `broker-dev-kafka-market-data.yaml` — Kafka → Jolt → Kafka
- `broker-dev-jms-settlement.yaml` — JMS → Groovy → JMS
- `broker-dev-sftp-report.yaml` — REST → Groovy CSV → SFTP
- `broker-dev-fix-order.yaml` — FIX NewOrderSingle → CBR → REST OMS mock

---

### Workstream H — Test Coverage [Sprint 1-3, continuous]

**Target:** 80%+ line coverage on esb-compiler and esb-adapters.

Unit tests (esb-compiler): RequiredFieldsRule, HttpMethodRule, RoutingValidationRule, BrokerIsolationRule, ValidationPipeline
Unit tests (esb-adapters): ResilienceInterceptor (GAP-003 verified), AuthInterceptor, AuditInterceptor, IdempotentConsumerInterceptor, Kafka/JMS/SFTP adapters
Integration tests (Testcontainers): RouteDeploymentIT, HotReloadIT, CircuitBreakerIT, AuthEnforcementIT, BrokerIsolationIT

**Test infra deps:** testcontainers-bom, testcontainers-kafka, testcontainers-postgresql

---

### Workstream I — UI Enhancements [Sprint 3]

**New nodes:** KafkaSourceNode, KafkaTargetNode, JmsSourceNode, FIXSourceNode, SFTPSourceNode
**Property panel additions:** Auth (type selector + conditional sub-fields), Circuit breaker, Idempotency, Rate limit
**New pages:** DlqPage.tsx, AuditPage.tsx, RoutesPage history tab
**TRANSFORM_EDITOR_CONFIG:** add `swift-mt`

---

## New Management API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /manage/routes/{name}/history | Route deployment version history |
| GET | /manage/dlq | All DLQ messages (paginated) |
| GET | /manage/dlq/{routeName} | DLQ messages for route |
| POST | /manage/dlq/{routeName}/replay | Replay DLQ message by ID |
| DELETE | /manage/dlq/{routeName}/{id} | Delete DLQ message |
| GET | /manage/audit | Audit log (paginated, filterable) |
| GET | /manage/routes/{name}/metrics | Route metrics snapshot |

---

## New Spec POJOs (esb-spec)

| POJO | Fields |
|---|---|
| `CircuitBreakerSpec` | enabled, failureRateThreshold (int, default 50), waitDurationSeconds (int, default 30), slidingWindowSize (int, default 10) |
| `AuditSpec` | enabled, maskFields (List), samplingRate (double 0-1) |
| `IdempotencySpec` | enabled, keyExpression, repositoryType (enum: memory/redis/jdbc), expireAfterSeconds |
| `RateLimitSpec` | requestsPerSecond (int), burstCapacity (int) |
| `TlsSpec` | truststorePath, truststorePasswordRef, keystorePath, keystorePasswordRef, clientAuth |
| `OAuthClientSpec` | tokenEndpoint, clientId, clientSecretRef, scopes (List) |

---

## Sprint Timeline

| Sprint | Weeks | Workstreams | Outcome |
|---|---|---|---|
| Sprint 1 | 1-2 | A+B+C | Retry bug fixed, auth enforced, circuit breaker, JSON logs |
| Sprint 2 | 3-4 | D+E | K8s deployable, Kafka/JMS/SFTP/FIX adapters |
| Sprint 3 | 5-6 | F+G+H+I | Audit trail, DLQ UI, broker routes, 80% test coverage |
| Sprint 4 | 7-8 | FIX deep, SWIFT, load test | Full protocol coverage, final demo |
| QA Phase | 9-10 | Integration tests, security scan, load test | All green, OWASP clean, P99 < 500ms |
| UAT Phase | 11-12 | Saudi+Kuwait broker sign-off | Production-ready |

### QA Exit Criteria
- Zero CRITICAL bugs open
- All automated tests passing (`mvn verify -pl esb-runtime -Pintegration-test`)
- OWASP scan clean: `mvn dependency-check:check`
- Container scan clean: `trivy image finexatech/esb-runtime:latest`
- Coverage ≥ 80%: `mvn jacoco:report`
- Load test: 100 concurrent, P99 < 500ms, error rate < 0.1%
- OpenAPI 3.0 spec generated via springdoc-openapi

### UAT Scenarios

| # | Scenario | Broker | Acceptance |
|---|---|---|---|
| UAT-01 | Drop YAML to PVC → live in <5s | Saudi | Route in Monitor UI |
| UAT-02 | Account balance REST → correct response + X-Correlation-ID | Saudi | HTTP 200 |
| UAT-03 | SWIFT payment → MT103 + UETR assigned + mock ACK | Saudi | UETR UUID in response |
| UAT-04 | Trade order CBR: market/limit/stop each routed correctly | Kuwait | Correct handler confirmed in audit |
| UAT-05 | Kafka market data → normalized on output topic | Dev | Jolt transform applied |
| UAT-06 | Invalid JWT → 401; missing role → 403; valid → 200 | Both | Auth enforced |
| UAT-07 | Target down → circuit opens, DLQ populated, replay works | Both | DlqPage shows message |
| UAT-08 | Same correlation ID sent twice → second gets X-Idempotent-Replay: true | Both | HTTP 200 |
| UAT-09 | Rate limit exceeded → HTTP 429 | Both | 429 with retry-after header |
| UAT-10 | New image deployed via helm upgrade → existing routes unaffected | Dev | Zero 5xx |
| UAT-11 | K8s rolling restart with active traffic → zero request loss | Both | No 5xx during upgrade |
| UAT-12 | Audit + DLQ pages show correct data, filter works | Both | UI displays correctly |

---

## Database / Persistence Strategy

| Concern | Production | Dev |
|---|---|---|
| Audit Trail | Kafka topic per namespace (`${BROKER_ID}.audit`, infinite retention) | PostgreSQL (`esb_audit` table) |
| DLQ | Kafka topic per route (`${BROKER_ID}.dlq.{routeName}`, 7-day retention) | PostgreSQL (`esb_dlq` table) |
| Idempotency | Redis (per-broker prefix, TTL configurable) | In-memory Camel repo |

Toggle via `application.yaml`:
```yaml
esb.resilience.dlq.type: kafka   # or jdbc
esb.idempotency.repository-type: redis  # or memory or jdbc
esb.idempotency.redis-prefix: ${BROKER_ID:dev}
```

---

## Runtime Extensibility (Adding New Camel Components)

1. Add Maven dependency to `esb-adapters/pom.xml`
2. Create new `@Component` adapter class
3. `mvn package` → new fat JAR
4. `docker build -t finexatech/esb-runtime:x.y.z .`
5. `helm upgrade esb-saudi ... --set image.tag=x.y.z`
6. K8s rolling restart (zero-downtime, 2 replicas)
7. **All existing YAMLs continue to work unchanged**
