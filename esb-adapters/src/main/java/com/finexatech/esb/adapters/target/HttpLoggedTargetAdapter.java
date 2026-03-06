package com.finexatech.esb.adapters.target;

import com.finexatech.esb.compiler.assembly.TargetAdapter;
import com.finexatech.esb.spec.TargetSpec;
import org.apache.camel.Exchange;
import org.apache.camel.Processor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Demo adapter: HTTP target with per-request logging.
 * Shows how to add a new protocol adapter in ~30 lines.
 *
 * 1. Add @Component — auto-discovered by Spring, zero config required
 * 2. Implement 4 methods: protocol(), buildToUri(), preProcessor(), postProcessor()
 * 3. Restart runtime → UI palette shows "http-logged" automatically
 *
 * YAML usage:
 *   target:
 *     type: http-logged
 *     endpointUrl: http://target-service/api/endpoint
 */
@Component
public class HttpLoggedTargetAdapter implements TargetAdapter {

    private static final Logger log = LoggerFactory.getLogger(HttpLoggedTargetAdapter.class);

    @Override
    public String protocol() { return "http-logged"; }

    @Override
    public String buildToUri(TargetSpec spec) {
        String url    = spec.getEndpointUrl();
        String scheme = url.startsWith("https") ? "https" : "http";
        String rest   = url.replaceFirst("^https?://", "");
        return "%s://%s?bridgeEndpoint=true&throwExceptionOnFailure=false".formatted(scheme, rest);
    }

    @Override
    public Processor preProcessor(TargetSpec spec) {
        return exchange -> {
            exchange.getIn().setHeader(Exchange.HTTP_METHOD, "POST");
            log.info("[DEMO] → Outbound call to {} | correlationId={}",
                spec.getEndpointUrl(),
                exchange.getIn().getHeader("X-Correlation-ID"));
        };
    }

    @Override
    public Processor postProcessor(TargetSpec spec) {
        return exchange -> {
            Integer code = exchange.getMessage().getHeader(
                Exchange.HTTP_RESPONSE_CODE, Integer.class);
            log.info("[DEMO] ← Response {} from {}", code, spec.getEndpointUrl());
        };
    }
}
