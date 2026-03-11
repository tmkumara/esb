package com.finexatech.esb.adapters.interceptors;

import com.finexatech.esb.adapters.audit.AuditEvent;
import com.finexatech.esb.adapters.audit.AuditStore;
import com.finexatech.esb.compiler.assembly.RouteInterceptor;
import com.finexatech.esb.spec.RouteSpec;
import org.apache.camel.Exchange;
import org.apache.camel.builder.RouteBuilder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;

/**
 * Records an AuditEvent for every message processed by a route.
 *
 * Order 1 — runs first so the start timestamp is captured before
 * any other interceptor processing.
 *
 * Flow:
 *   interceptFrom()  → capture start time, method, path, sourceIp
 *   onCompletion()   → compute duration, read status code, build + store AuditEvent
 */
@Component
public class AuditInterceptor implements RouteInterceptor {

    @Autowired
    private AuditStore auditStore;

    @Override
    public int order() { return 1; }

    @Override
    public void apply(RouteBuilder builder, RouteSpec spec) {
        // Capture request metadata on message entry
        builder.interceptFrom()
            .process(exchange -> {
                exchange.setProperty("audit.start",    System.currentTimeMillis());
                exchange.setProperty("audit.method",
                    exchange.getIn().getHeader(Exchange.HTTP_METHOD, String.class));
                exchange.setProperty("audit.path",
                    exchange.getIn().getHeader(Exchange.HTTP_URI, String.class));

                // Try X-Forwarded-For first (proxy/load balancer), fall back to REMOTE_ADDR
                String ip = exchange.getIn().getHeader("X-Forwarded-For", String.class);
                if (ip == null) {
                    ip = exchange.getIn().getHeader("REMOTE_ADDR", "unknown", String.class);
                }
                exchange.setProperty("audit.sourceIp", ip);
            });

        // Build and record audit event after route completes (success or failure)
        builder.onCompletion()
            .process(exchange -> {
                long start    = exchange.getProperty("audit.start", 0L, Long.class);
                long duration = System.currentTimeMillis() - start;

                // Correlation header is guaranteed set by CorrelationInterceptor before this fires
                String correlationId = exchange.getIn().getHeader(
                    spec.getCorrelation().getHeader(), "unknown", String.class);

                String method   = exchange.getProperty("audit.method",   "?", String.class);
                String path     = exchange.getProperty("audit.path",     "?", String.class);
                String sourceIp = exchange.getProperty("audit.sourceIp", "unknown", String.class);

                // HTTP response code — fall back based on failure flag
                Integer statusCode = exchange.getMessage()
                    .getHeader(Exchange.HTTP_RESPONSE_CODE, Integer.class);
                if (statusCode == null) {
                    statusCode = exchange.isFailed() ? 500 : 200;
                }

                auditStore.record(new AuditEvent(
                    UUID.randomUUID().toString(),
                    spec.routeName(),
                    correlationId,
                    method   != null ? method   : "?",
                    path     != null ? path     : "?",
                    sourceIp != null ? sourceIp : "unknown",
                    statusCode,
                    duration,
                    Instant.now().toString()
                ));
            });
    }
}
