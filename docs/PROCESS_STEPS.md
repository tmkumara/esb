# Process Steps — Complex Logic in Routes

> This document answers: "How do users express complex business logic without writing Java code?"
> Answer: A typed step pipeline between source and target, with UI panels matched to complexity.

---

## The Problem

A route is never just `source → transform → target` in reality:

```
REAL WORLD:
  REST source
    → validate incoming JSON schema
    → enrich with account data from another service
    → classify order by amount (set a header)
    → map fields (rename, type-convert)
    → if large order: route to manual queue
    → if standard: transform to SOAP and send
    → log result
    → return response
```

None of that fits in a single XSLT or Jolt transform.
Without Process Steps, users must write Java code for every complex route.

---

## The Solution: Step Pipeline

Every route has an optional `process` block containing an ordered list of steps.
Each step is one focused operation. Complex logic = compose simple steps.

```
┌────────────┐   ┌──────────────────────────────────────────┐   ┌────────────┐
│   SOURCE   │──▶│              PROCESS STEPS               │──▶│   TARGET   │
│  (REST)    │   │                                          │   │  (SOAP)    │
│            │   │  validate → enrich → set-header → map   │   │            │
└────────────┘   └──────────────────────────────────────────┘   └────────────┘
```

In the UI these appear as small nodes on the canvas between source and target.
In YAML they are a `process.steps[]` list inside the RouteSpec.

---

## All Step Types

### Tier 0 — Simple Steps (form-based UI, no code)

| Step Type | What It Does | Camel DSL |
|---|---|---|
| `set-header` | Set/overwrite a header with a value or expression | `.setHeader(name, exp)` |
| `remove-header` | Remove one header by name | `.removeHeader(name)` |
| `remove-headers` | Remove headers matching a pattern | `.removeHeaders(pattern)` |
| `set-body` | Replace body with expression result | `.setBody(exp)` |
| `set-property` | Set an exchange property (not forwarded to target) | `.setProperty(name, exp)` |
| `log` | Emit a structured log entry | `.log(level, msg)` |
| `delay` | Add fixed delay (testing / throttle) | `.delay(ms)` |
| `throttle` | Limit messages per time period | `.throttle(n).timePeriodMillis(ms)` |
| `marshal` | Serialize body to a data format | `.marshal().json()` / `.marshal().jacksonXml()` |
| `unmarshal` | Deserialize body from a data format | `.unmarshal().json(MyClass.class)` |

### Tier 1 — Medium Steps (expression builder UI)

| Step Type | What It Does | Camel DSL |
|---|---|---|
| `filter` | Pass message only if condition is true, drop otherwise | `.filter(exp)` |
| `validate` | Validate body against JSON Schema or XML Schema | `.to("json-validator:...")` |
| `convert-body` | Convert body type (e.g. String → InputStream) | `.convertBodyTo(Class)` |
| `enrich` | Call another route/endpoint, merge result into message | `.enrich(uri, strategy)` |
| `poll-enrich` | Poll a passive endpoint (file, JMS) and enrich | `.pollEnrich(uri, strategy)` |

### Tier 2 — Complex Steps (Monaco editor or visual builder UI)

| Step Type | What It Does | Camel DSL |
|---|---|---|
| `choice` | Multi-branch conditional (nested routing) | `.choice().when().otherwise()` |
| `map` | Declarative field mapping (visual field mapper) | `.process(FieldMappingProcessor)` |
| `script` | Inline Groovy/JS code or external script file | `.process(ScriptProcessor)` |
| `split` | Split one message into many, process each | `.split(exp).process(...)` |
| `aggregate` | Collect many messages into one | `.aggregate(correlId, strategy)` |
| `wire-tap` | Copy message to secondary route (fire-and-forget) | `.wireTap(uri)` |

---

## YAML Specification

```yaml
process:
  steps:

    # ── VALIDATE ───────────────────────────────────────────────────────
    - id: validate-input
      type: validate
      schema: classpath:schema/order-input.json   # JSON Schema or XSD

    # ── ENRICH ─────────────────────────────────────────────────────────
    - id: load-account
      type: enrich
      source: direct:account-lookup               # another route in this ESB
      aggregationStrategy: merge-into-body        # merge | replace | header-only
      timeout: 5000                               # fail fast if enrichment slow

    # ── SET HEADER ─────────────────────────────────────────────────────
    - id: classify
      type: set-header
      name: X-Order-Class
      expression:
        language: simple                          # simple | xpath | jsonpath | groovy | constant
        value: "${body.amount} > 1000000 ? 'LARGE' : 'STANDARD'"

    # ── FILTER ─────────────────────────────────────────────────────────
    - id: active-only
      type: filter
      expression:
        language: jsonpath
        value: "$.status == 'ACTIVE'"
      onFiltered: drop                            # drop | dead-letter | log

    # ── FIELD MAP ──────────────────────────────────────────────────────
    # (visual field mapper in UI)
    - id: normalize-fields
      type: map
      mappings:
        - from: body.orderId
          to:   body.orderReference
        - from: body.customerId
          to:   body.clientId
          transform: uppercase
        - from: body.amount
          to:   body.totalAmount
          transform: "multiply(100)"              # pence conversion
        - from: body.createdAt
          to:   body.tradeDateStr
          transform: "dateFormat('yyyy-MM-dd')"
        - from: body.items[*].sku
          to:   body.lineItems[*].productCode     # array path support

    # ── SCRIPT ─────────────────────────────────────────────────────────
    # (Monaco editor in UI)
    - id: custom-validation
      type: script
      language: groovy                            # groovy | js | jexl
      resource: classpath:scripts/order-check.groovy
      # OR inline for short logic:
      # inline: |
      #   def body = exchange.in.body
      #   if (body.items.isEmpty()) {
      #       throw new RuntimeException("Order has no items")
      #   }

    # ── CHOICE ─────────────────────────────────────────────────────────
    # (multi-branch builder in UI)
    - id: route-by-type
      type: choice
      when:
        - condition:
            language: simple
            value: "${header.X-Order-Class} == 'LARGE'"
          steps:
            - type: set-header
              name: X-Approval-Required
              expression: { language: constant, value: "true" }
      otherwise:
        steps:
          - type: log
            message: "Standard order ${header.X-Correlation-ID}"
            level: DEBUG

    # ── LOG ────────────────────────────────────────────────────────────
    - id: audit-log
      type: log
      message: "Order ${body.orderId} processed by ${header.X-Account-Id}"
      level: INFO
      mask: [body.cardNumber, body.cvv]           # fields to redact

    # ── MARSHAL ────────────────────────────────────────────────────────
    - id: to-xml
      type: marshal
      format: jacksonXml                          # json | jacksonXml | csv | avro
      rootElement: Order                          # for XML formats

    # ── REMOVE HEADERS ─────────────────────────────────────────────────
    - id: clean-internal-headers
      type: remove-headers
      pattern: "X-Internal-*"
```

---

## Java Architecture: Step Adapter Registry

Follows the same pattern as Source/Target adapters.
Adding a new step type = one class. Core never changes.

```java
// The step interface — identical pattern to SourceAdapter/TargetAdapter
public interface StepAdapter {
    String type();                                     // matches step.type in YAML
    void apply(RouteDefinition route, StepSpec spec);  // applies to Camel DSL
    ValidationResult validate(StepSpec spec);          // step-specific validation
}

// Registry — Spring auto-discovers all @Component implementations
@Component
public class StepAdapterRegistry {
    private final Map<String, StepAdapter> adapters;

    @Autowired
    public StepAdapterRegistry(List<StepAdapter> all) {
        this.adapters = all.stream()
            .collect(Collectors.toMap(StepAdapter::type, Function.identity()));
    }

    public StepAdapter get(String type) {
        StepAdapter a = adapters.get(type);
        if (a == null) throw new RouteConfigException(
            "No step adapter for type '%s'. Available: %s".formatted(type, adapters.keySet()));
        return a;
    }
}
```

### Example: ScriptStepAdapter

```java
@Component
public class ScriptStepAdapter implements StepAdapter {

    @Override
    public String type() { return "script"; }

    @Override
    public void apply(RouteDefinition route, StepSpec spec) {
        if (spec.resource() != null) {
            // External file — loaded once, cached
            route.process(ScriptProcessorFactory.fromResource(
                spec.language(), spec.resource()
            ));
        } else if (spec.inline() != null) {
            // Inline script — compiled and cached by hash
            route.process(ScriptProcessorFactory.fromInline(
                spec.language(), spec.inline()
            ));
        }
    }

    @Override
    public ValidationResult validate(StepSpec spec) {
        // L3 Semantic: try to compile the script, report errors
        if (spec.inline() != null) {
            return ScriptCompiler.tryCompile(spec.language(), spec.inline());
        }
        if (spec.resource() != null) {
            return ScriptCompiler.tryCompileResource(spec.resource());
        }
        return ValidationResult.error("script step requires 'inline' or 'resource'");
    }
}
```

### Example: MapStepAdapter

```java
@Component
public class MapStepAdapter implements StepAdapter {

    @Override
    public String type() { return "map"; }

    @Override
    public void apply(RouteDefinition route, StepSpec spec) {
        route.process(new FieldMappingProcessor(spec.mappings()));
    }
}

// FieldMappingProcessor handles the actual field operations
public class FieldMappingProcessor implements Processor {
    private final List<FieldMapping> mappings;

    @Override
    public void process(Exchange exchange) {
        // Use JsonPath for reading, Jackson ObjectNode for writing
        ObjectNode body = (ObjectNode) exchange.getIn().getBody(ObjectNode.class);
        ObjectNode result = mapper.createObjectNode();

        for (FieldMapping m : mappings) {
            Object value = JsonPath.read(body, m.from());
            Object transformed = applyTransform(value, m.transform());
            setByPath(result, m.to(), transformed);
        }
        exchange.getIn().setBody(result);
    }

    private Object applyTransform(Object value, String transform) {
        if (transform == null) return value;
        return switch (parseTransformName(transform)) {
            case "uppercase"       -> value.toString().toUpperCase();
            case "lowercase"       -> value.toString().toLowerCase();
            case "trim"            -> value.toString().trim();
            case "multiply"        -> multiply(value, parseArg(transform));
            case "dateFormat"      -> reformatDate(value, parseArg(transform));
            default -> throw new RouteConfigException("Unknown transform: " + transform);
        };
    }
}
```

### How RouteAssembler handles steps (the one change needed)

```java
// In RouteAssembler.assemble() — add this after source, before target:
if (spec.process() != null && !spec.process().steps().isEmpty()) {
    applyProcessSteps(route, spec.process().steps());
}

private void applyProcessSteps(RouteDefinition route, List<StepSpec> steps) {
    for (StepSpec step : steps) {
        stepAdapterRegistry.get(step.type()).apply(route, step);
    }
}
```

---

## UI Representation per Step Type

### How the UI panel changes per step type

```
Step Type      UI Panel                     Complexity
──────────────────────────────────────────────────────────────
set-header     key/value form + exp picker  ●○○  Simple form
remove-headers pattern input                ●○○  Simple form
log            template + level dropdown    ●○○  Simple form
delay          number spinner (ms)          ●○○  Simple form
throttle       rate + period form           ●○○  Simple form
filter         visual expression builder    ●●○  Expression builder
validate       schema file picker           ●○○  Simple form
marshal        format dropdown + options    ●○○  Simple form
set-body       expression builder           ●●○  Expression builder
enrich         route/endpoint picker + agg  ●●○  Pickers
choice         multi-condition builder      ●●○  Condition list
map            visual field mapper          ●●●  Rich UI (see below)
script         Monaco code editor          ●●●  Full editor
aggregate      correlation + strategy form  ●●●  Complex form
split          expression + sub-steps       ●●○  Expression builder
```

### Expression Builder UI (for filter, set-header, set-body, etc.)

```
┌─────────────────────────────────────────────────────────────┐
│  Expression Builder                                         │
├─────────────────────────────────────────────────────────────┤
│  Language: [ Simple ▼ ]  [ JSONPath ▼ ]  [ Groovy ▼ ]      │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ${body.amount} > 1000000 ? 'LARGE' : 'STANDARD'      │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  💡 Available: ${body.fieldName}  ${header.X-Name}          │
│                ${exchangeProperty.name}                     │
│                                                             │
│  [ Validate Expression ]  → ✅ Valid                        │
└─────────────────────────────────────────────────────────────┘
```

### Visual Field Mapper UI (for map step)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Field Mapper                                                            │
├────────────────────┬──────────────────────┬──────────────────────────────┤
│  SOURCE FIELDS     │    TRANSFORM         │  TARGET FIELDS              │
│  (from schema)     │                      │  (from schema)              │
├────────────────────┼──────────────────────┼──────────────────────────────┤
│  ● orderId         │──────────────────────│● orderReference             │
│  ● customerId      │── [uppercase ▼] ─────│● clientId                   │
│  ● amount          │── [multiply(100)▼] ──│● totalAmount                │
│  ● createdAt       │── [dateFormat ▼] ────│● tradeDateStr               │
│  ● items[].sku     │──────────────────────│● lineItems[].productCode    │
│  ● items[].qty     │    (unmapped)        │● (unmapped below)           │
│                    │                      │● status (drag from left)    │
│  [ + Add custom ]  │  Transform options:  │  [ + Add computed field ]   │
│                    │  • uppercase          │                             │
│                    │  • lowercase          │                             │
│                    │  • multiply(n)        │                             │
│                    │  • dateFormat(fmt)    │                             │
│                    │  • constant(val)      │                             │
│                    │  • expression...      │                             │
└────────────────────┴──────────────────────┴──────────────────────────────┘

Schemas loaded from:
  Source: JSON Schema file or inferred from sample payload
  Target: WSDL schema (for SOAP target) or JSON Schema
```

### Monaco Script Editor UI (for script step)

```
┌────────────────────────────────────────────────────────────────────────┐
│  Script Step: custom-validation                 Language: [Groovy ▼]  │
├───────────────────────┬────────────────────────────────────────────────┤
│  EXCHANGE REFERENCE   │  script editor                                 │
│  ─────────────────── │  ──────────────────────────────────────────── │
│  exchange             │  1  // Available: exchange, request, response  │
│  ├─ in                │  2  def body = exchange.in.body                │
│  │  ├─ body           │  3  def amount = body.amount as BigDecimal     │
│  │  ├─ headers        │  4                                             │
│  │  └─ attachments   │  5  if (body.items == null || body.items       │
│  ├─ out               │  6      .isEmpty()) {                          │
│  ├─ properties        │  7      throw new IllegalArgumentException(    │
│  └─ context           │  8          "Order must have at least 1 item") │
│                       │  9  }                                          │
│  HEADERS              │ 10                                             │
│  ─────────────────── │ 11  exchange.in.setHeader(                      │
│  X-Correlation-ID     │ 12      "X-Item-Count",                        │
│  X-Account-Id         │ 13      body.items.size())                     │
│  Content-Type         │                                                │
│                       │  ┌──────────────────────────────────────────┐ │
│  COMMON OPERATIONS    │  │ TEST WITH SAMPLE PAYLOAD                 │ │
│  ─────────────────── │  │ { "orderId": "ORD001",                   │ │
│  Set header           │  │   "items": [],                           │ │
│  Get body field       │  │   "amount": 500 }                        │ │
│  Throw exception      │  │                                          │ │
│  Route to DLQ         │  │ [ Run Test ]  → ❌ IllegalArgument...    │ │
│                       │  └──────────────────────────────────────────┘ │
└───────────────────────┴────────────────────────────────────────────────┘
```

---

## Validation for Process Steps

Each step type registers its own validation rules.

```
VALIDATE STEP
  □ schema file exists on classpath              (L3 Semantic)
  □ schema is valid JSON Schema or XSD           (L3 Semantic)

ENRICH STEP
  □ source route exists in RouteRegistry         (L3 Semantic)
  □ timeout > 0                                  (L1 Structural)
  □ aggregationStrategy is known value           (L2 Schema)

MAP STEP
  □ no two mappings write to the same target field  (L1 Structural)
  □ all transform names are known                   (L2 Schema)
  □ transform arguments are valid types             (L2 Schema)

SCRIPT STEP
  □ language is groovy|js|jexl                   (L2 Schema)
  □ script compiles without error                (L3 Semantic — uses ScriptEngine)
  □ resource file exists if resource: specified  (L3 Semantic)

CHOICE STEP
  □ at least one when condition                  (L1 Structural)
  □ conditions parse without error               (L2 Schema)
  □ all nested steps are valid                   (recurse)

FILTER STEP
  □ expression language is known                 (L2 Schema)
  □ expression parses without error              (L2 Schema)
  □ onFiltered is drop|dead-letter|log           (L2 Schema)
```

---

## Complete Step Spec POJO Design

```java
// esb-spec module
public record StepSpec(
    String        id,           // unique within route, kebab-case
    StepType      type,         // enum matching YAML type values
    ExpressionSpec expression,  // for filter, set-header, set-body
    String        name,         // for set-header, remove-header
    String        pattern,      // for remove-headers
    String        source,       // for enrich: target route/endpoint
    String        schema,       // for validate
    String        language,     // for script
    String        resource,     // for script (classpath:)
    String        inline,       // for script (inline code)
    String        format,       // for marshal/unmarshal
    String        message,      // for log
    String        level,        // for log
    List<String>  mask,         // for log: fields to redact
    Long          delayMs,      // for delay
    Long          throttleRate, // for throttle
    Long          throttlePeriod,
    List<FieldMapping> mappings, // for map
    List<ChoiceWhen>   when,    // for choice
    List<StepSpec>     otherwise, // for choice
    Map<String, String> params  // generic extra params
) {}

public record ExpressionSpec(
    String language,   // simple | jsonpath | xpath | groovy | constant
    String value
) {}

public record FieldMapping(
    String from,       // JsonPath-style source field
    String to,         // JsonPath-style target field
    String transform   // optional: uppercase|lowercase|multiply(n)|dateFormat(f)|constant(v)
) {}
```

---

## Adding a New Step Type — Checklist

```
1. Add enum value to StepType
2. Add fields to StepSpec if needed (or use params map for simple cases)
3. Write StepAdapter implementation:
   - @Component
   - type() returns the step type string
   - apply() calls the Camel DSL
   - validate() returns step-specific errors
4. Write validation rules if L3 Semantic checks needed
5. Write unit test: adapter.apply() on a mock RouteDefinition
6. Add step to PROCESS_STEPS.md documentation
7. Add UI panel descriptor to esb-catalog/overrides/steps/{type}.yaml
```

---

## Step Type: UI Panel Descriptor (YAML)

Steps also have override YAMLs, just like components:

```yaml
# esb-catalog/src/main/resources/steps/script.yaml
type: script
displayName: "Script"
description: "Execute Groovy, JavaScript or JEXL code inline or from a file"
uiIcon: "code-icon"
uiColor: "#9B59B6"
uiPanel: monaco-editor         # simple-form | expression-builder | monaco-editor | field-mapper | choice-builder
language:
  default: groovy
  options: [groovy, js, jexl]
fields:
  - name: language
    label: "Script Language"
    type: select
    required: true
  - name: resource
    label: "Script File (classpath:)"
    type: resource-picker
    placeholder: "classpath:scripts/my-script.groovy"
  - name: inline
    label: "Inline Script"
    type: monaco-editor
    showIf: "!resource"
validationRules:
  - ScriptCompilesRule
```
