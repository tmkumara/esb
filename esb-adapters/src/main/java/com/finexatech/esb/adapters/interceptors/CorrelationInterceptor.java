package com.finexatech.esb.adapters.interceptors;

import com.finexatech.esb.compiler.assembly.RouteInterceptor;
import com.finexatech.esb.spec.CorrelationSpec;
import com.finexatech.esb.spec.RouteSpec;
import org.apache.camel.builder.RouteBuilder;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Injects a correlation ID on every inbound message.
 * Sets MDC so all log lines for this request carry the ID.
 * Propagates the ID to outbound calls via header.
 *
 * Order 50 — runs last among interceptors (after error handler, retry, etc.)
 */
@Component
public class CorrelationInterceptor implements RouteInterceptor {

    @Override
    public int order() { return 50; }

    @Override
    public void apply(RouteBuilder builder, RouteSpec spec) {
        CorrelationSpec corr = spec.getCorrelation();
        String header = corr.getHeader();

        // interceptFrom fires on every message entering ANY route in this RouteBuilder
        builder.interceptFrom()
            .process(exchange -> {
                String correlationId = exchange.getIn().getHeader(header, String.class);

                if (correlationId == null || correlationId.isBlank()) {
                    if (corr.isGenerateIfMissing()) {
                        correlationId = UUID.randomUUID().toString();
                        exchange.getIn().setHeader(header, correlationId);
                    }
                }

                if (correlationId != null) {
                    // MDC so every log line in this thread carries the ID
                    MDC.put("correlationId", correlationId);
                    MDC.put("routeName", spec.routeName());
                }
            });
    }
}
