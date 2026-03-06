package com.finexatech.esb.adapters.target;

import com.finexatech.esb.compiler.assembly.TargetAdapter;
import com.finexatech.esb.spec.TargetSpec;
import org.apache.camel.Exchange;
import org.apache.camel.Processor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Mock response target — returns a static body configured in the route YAML.
 *
 * No external service needed. The response body and status code live inside
 * the YAML spec itself — no Java code required per mock endpoint.
 *
 * YAML:
 *   target:
 *     type: mock-response
 *     mockStatusCode: 200
 *     mockBody: |
 *       {"accountNumber": "12345", "balance": 2500.75}
 *
 * Usage: create a route whose SOURCE is the endpoint you want to mock.
 * The ESB becomes the mock server — no MockSoapController or similar needed.
 */
@Component
public class MockResponseTargetAdapter implements TargetAdapter {

    private static final Logger log = LoggerFactory.getLogger(MockResponseTargetAdapter.class);

    @Override
    public String protocol() { return "mock-response"; }

    @Override
    public String buildToUri(TargetSpec spec) {
        // log: component — lightweight no-op passthrough, body unchanged
        return "log:mock-response?level=DEBUG&showBody=false&showHeaders=false";
    }

    @Override
    public Processor preProcessor(TargetSpec spec) {
        String body       = spec.getMockBody() != null ? spec.getMockBody().strip() : "{}";
        int    statusCode = spec.getMockStatusCode();
        // Auto-detect content type
        String contentType = body.startsWith("<") ? "text/xml; charset=utf-8"
                                                  : "application/json; charset=utf-8";

        return exchange -> {
            exchange.getIn().setBody(body);
            exchange.getIn().setHeader(Exchange.HTTP_RESPONSE_CODE, statusCode);
            exchange.getIn().setHeader("Content-Type", contentType);
            log.debug("Mock response: status={} body-length={}", statusCode, body.length());
        };
    }
}
