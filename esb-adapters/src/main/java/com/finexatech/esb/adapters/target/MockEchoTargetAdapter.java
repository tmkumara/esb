package com.finexatech.esb.adapters.target;

import com.finexatech.esb.compiler.assembly.TargetAdapter;
import com.finexatech.esb.spec.TargetSpec;
import org.apache.camel.Exchange;
import org.springframework.stereotype.Component;

/**
 * Simulator target — use this when a route should ACT as a third-party endpoint.
 *
 * YAML: target.type = "mock-echo"
 *
 * What it does:
 *   - Routes to Camel log: component (no HTTP call, no external dependency)
 *   - The exchange body is NOT changed — whatever the transform set is returned as HTTP response
 *   - Sets Content-Type: application/json
 *
 * Typical use:
 *   Route (simulator):
 *     source: rest POST /v1/mock/orders
 *     transform.request: groovy  ← builds the fake response body
 *     target: mock-echo          ← returns that body as HTTP 200
 *
 *   Route (real):
 *     target.endpointUrl: http://localhost:9090/api/v1/mock/orders
 */
@Component
public class MockEchoTargetAdapter implements TargetAdapter {

    @Override
    public String protocol() { return "mock-echo"; }

    @Override
    public String buildToUri(TargetSpec spec) {
        // log: component logs the body and passes it through unchanged
        return "log:mock-echo?level=INFO&showBody=true&showHeaders=false";
    }

    @Override
    public org.apache.camel.Processor preProcessor(TargetSpec spec) {
        return exchange -> {
            exchange.getIn().setHeader(Exchange.CONTENT_TYPE, "application/json");
        };
    }
}
