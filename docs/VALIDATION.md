# Validation Architecture Reference

## The 5 Layers at a Glance

```
Layer         Where runs    Cost      Triggered by
─────────────────────────────────────────────────────────────────
L1 STRUCTURAL  client+server  < 10ms   every field change in UI
L2 SCHEMA      server         < 10ms   every field change in UI
L3 SEMANTIC    server         100ms–2s file upload, "Validate" button
L4 COMPAT      server         < 50ms   drop new component node in UI
L5 DRY_RUN     server         1–5s     "Validate All" button, Deploy
```

## Rule Inventory

### L1 — Structural Rules
| Rule | Checks |
|---|---|
| NameFormatRule | kebab-case, 1–64 chars |
| RequiredFieldsRule | source, target, transform all present |
| HttpMethodRule | GET\|POST\|PUT\|DELETE\|PATCH only |
| RetryConfigRule | maxAttempts 1–10, delays > 0 |
| TimeoutRule | connectMs < readMs, both > 0 |
| RoutingDefaultRule | content-based routing has exactly one `default: true` |
| PathParamConsistencyRule | {params} in path appear in validation.pathParams |

### L2 — Schema Rules
| Rule | Checks |
|---|---|
| SourceTypeKnownRule | type exists in ComponentDescriptorRegistry |
| TargetTypeKnownRule | type exists in ComponentDescriptorRegistry |
| TransformTypeKnownRule | xslt\|jolt\|groovy\|jsonata\|passthrough |
| RetryBackoffTypeRule | fixed\|exponential only |
| AuthTypeRule | jwt\|basic\|api-key\|none only |
| ConditionSyntaxRule | routing conditions parse without error |
| ExpressionLanguageRule | simple\|xpath\|jsonpath\|groovy only |

### L3 — Semantic Rules (do I/O, results cached in ValidationContext)
| Rule | Checks |
|---|---|
| WsdlExistsRule | WSDL file/URL loads as valid XML |
| WsdlOperationExistsRule | operation name in WSDL port |
| WsdlSchemaValidRule | WSDL schema is well-formed |
| XsltCompilesRule | XSLT loads and Saxon compiles it |
| XsltSchemaCompatRule | XSLT input namespace matches WSDL namespace |
| JoltSpecValidRule | Jolt spec is valid JSON |
| EnvVarResolvableRule | all ${VAR} references exist in environment |
| TransformResourceExistsRule | all classpath: resources exist in JAR |
| AuthConfigCompleteRule | JWT: issuer set. Basic: user+pass set. |
| JsonSchemaValidRule | body schema file exists and is valid JSON Schema |

### L4 — Compatibility Rules
| Rule | Checks |
|---|---|
| SourceTargetCompatRule | matrix: can source type talk to target type? |
| TransformOutputFormatRule | if target=soap/fixml, request transform output must be XML |
| AuthPropagationRule | if source has auth, target auth is configured |
| PathConflictRule | no two live routes on same HTTP method+path |
| RoutingBranchCompatRule | each routing branch passes L4 independently |
| ContentTypeCompatRule | source produces matches target consumes |

### L5 — Dry-Run Rules
| Rule | Checks |
|---|---|
| CamelDryRunRule | builds route in isolated CamelContext with mock components |
| | → catches: bad URI structure, missing beans, circular routes |
| | → catches: invalid EL expressions, component config errors |

## Compatibility Matrix

```
SOURCE  →  TARGET    soap  fixml  jms  kafka  rest  ftp  file  jdbc
────────────────────────────────────────────────────────────────────
rest          │        ✓     ✓     ✓     ✓     ✓    W*    ✓     ✓
timer         │        ✓     ✓     ✓     ✓     ✓     ✓    ✓     ✓
jms           │        ✓     ✓     ✓     ✓     ✓     ✓    ✓     ✓
kafka         │        ✓     ✓     ✓     ✓     ✓     ✓    ✓     ✓
file          │        ✓     ✓     ✓     ✓     ✓     ✓    ✓     ✓
sftp          │        ✓     ✓     ✓     ✓     ✓     ✓    ✓     ✓

W* = WARNING: REST source → FTP target produces empty response body.
     Valid use case (fire-and-forget upload), but usually unintentional.
     Show warning, allow deploy.
```

## ValidationContext: Shared State

Rules can share computed results so expensive operations run once:

```java
// WsdlExistsRule computes and caches:
ctx.put("wsdl:" + spec.target().wsdl(), parsedWsdlDefinition);

// WsdlOperationExistsRule reuses it:
WSDLDefinition wsdl = ctx.get("wsdl:" + spec.target().wsdl(), WSDLDefinition.class);
```

## Calling the Pipeline from Code

```java
// Fast check (e.g., on each UI keystroke)
ValidationReport r = pipeline.validate(spec, ValidationLayer.SCHEMA);

// Full check before deploy
ValidationReport r = pipeline.validate(spec, ValidationLayer.DRY_RUN);

if (!r.passed()) {
    throw new RouteValidationException(r);
}
```

## CI Pipeline Integration

Every commit to routes/ directory triggers:

```yaml
# .github/workflows/validate-routes.yml
- name: Validate all route specs
  run: |
    curl -X POST http://esb-ci:8080/api/validate/batch \
      -H "Content-Type: application/yaml" \
      --data-binary @routes/ \
      --fail-with-body
```

This catches broken routes before they reach any environment.
