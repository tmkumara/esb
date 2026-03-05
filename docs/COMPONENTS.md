# Component Registry Reference

> How to read this: Tier = when it gets implemented. Adapter = how much custom code needed.

## Source Components (inbound)

| Scheme | Display Name | Tier | Adapter Type | Camel Component |
|---|---|---|---|---|
| rest | REST / HTTP | T0 | Specialized | camel-rest + camel-servlet |
| timer | Timer / Scheduler | T2 | Generic | camel-timer |
| quartz | Quartz Scheduler | T2 | Generic | camel-quartz |
| jms | JMS (ActiveMQ/Artemis) | T1 | Generic | camel-jms |
| kafka | Apache Kafka | T1 | Specialized | camel-kafka |
| file | File System | T2 | Generic | camel-file |
| ftp | FTP | T2 | Generic | camel-ftp |
| sftp | SFTP | T2 | Generic | camel-ftp |
| grpc | gRPC | T3 | Specialized | camel-grpc |
| websocket | WebSocket | T3 | Specialized | camel-websocket |

## Target Components (outbound)

| Scheme | Display Name | Tier | Adapter Type | Camel Component |
|---|---|---|---|---|
| soap (cxf) | SOAP / CXF | T0 | Specialized | camel-cxf |
| rest (http) | REST / HTTP | T0 | Generic | camel-http |
| jms | JMS | T1 | Generic | camel-jms |
| kafka | Apache Kafka | T1 | Specialized | camel-kafka |
| ftp | FTP | T2 | Generic | camel-ftp |
| sftp | SFTP | T2 | Generic | camel-ftp |
| file | File System | T2 | Generic | camel-file |
| smtp | Email (SMTP) | T2 | Generic | camel-mail |
| jdbc | Database (JDBC) | T3 | Specialized | camel-jdbc |
| jpa | Database (JPA) | T3 | Specialized | camel-jpa |
| grpc | gRPC | T3 | Specialized | camel-grpc |
| fixml | FIXML / FIX | T3 | Custom | camel-netty + custom |
| sap | SAP RFC | T3 | Custom | camel-sap |

## Transform Types

| Type | Input→Output | Tier | Notes |
|---|---|---|---|
| passthrough | any → same | T0 | No transform, forward as-is |
| xslt | XML → XML | T0 | Saxon HE 3.0, cached templates |
| jolt | JSON → JSON | T0 | Declarative JSON transform |
| groovy | any → any | T1 | Script, full access to exchange |
| jsonata | JSON → JSON | T1 | JSONata expression language |
| freemarker | any → text | T2 | Template-based |
| velocity | any → text | T2 | Template-based |

## Routing Patterns

| Pattern | Camel DSL | Tier | Notes |
|---|---|---|---|
| linear | from→to | T0 | Default, single path |
| content-based | choice() | T1 | Condition-based branching |
| filter | filter() | T1 | Pass-through or drop |
| splitter | split() | T2 | One message → many |
| aggregator | aggregate() | T2 | Many messages → one |
| wire-tap | wireTap() | T2 | Copy to secondary route |
| dynamic-router | dynamicRouter() | T3 | Runtime-computed routing |
| recipient-list | recipientList() | T3 | Broadcast to multiple targets |

---

## Adding a New Component — Quick Reference

See ARCHITECTURE.md §12 for the full checklist.

Short version:
1. Does GenericCamelAdapter cover it? → just add override YAML, done.
2. Needs custom URI or session? → write SpecializedAdapter extends GenericCamelAdapter.
3. Proprietary protocol? → write CustomProtocolAdapter implements TargetAdapter.
4. Always: add override YAML + update CompatibilityMatrix + write tests.
