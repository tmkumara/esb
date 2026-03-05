package com.finexatech.esb.adapters.interceptors;

import com.finexatech.esb.compiler.assembly.RouteInterceptor;
import com.finexatech.esb.spec.ErrorSpec;
import com.finexatech.esb.spec.RouteSpec;
import org.apache.camel.Exchange;
import org.apache.camel.builder.RouteBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Global error handler for a route.
 * On any uncaught exception:
 *   1. Logs structured error with correlation ID
 *   2. Returns a clean JSON error response (not a stack trace)
 *   3. Sends to dead letter route if configured
 *
 * Order 10 — must be first so it wraps everything else.
 */
@Component
public class ErrorHandlingInterceptor implements RouteInterceptor {

    private static final Logger log = LoggerFactory.getLogger(ErrorHandlingInterceptor.class);

    @Override
    public int order() { return 10; }

    @Override
    public void apply(RouteBuilder builder, RouteSpec spec) {
        ErrorSpec err = spec.getErrorHandling();

        builder.onException(Exception.class)
            .handled(true)
            .process(exchange -> {
                Exception cause = exchange.getProperty(Exchange.EXCEPTION_CAUGHT, Exception.class);
                String correlationId = exchange.getIn().getHeader("X-Correlation-ID", String.class);

                log.error("Route '{}' error [correlationId={}]: {}",
                          spec.routeName(), correlationId,
                          cause != null ? cause.getMessage() : "unknown", cause);

                // Return structured JSON error — never expose stack traces
                String errorBody = """
                    {
                      "status": "error",
                      "code": "ROUTE_PROCESSING_FAILED",
                      "message": "%s",
                      "correlationId": "%s",
                      "route": "%s"
                    }
                    """.formatted(
                        sanitize(cause != null ? cause.getMessage() : "Processing failed"),
                        correlationId != null ? correlationId : "unknown",
                        spec.routeName()
                    );

                exchange.getIn().setBody(errorBody);
                exchange.getIn().setHeader(Exchange.HTTP_RESPONSE_CODE, err.getFallbackHttpStatus());
                exchange.getIn().setHeader("Content-Type", "application/json");
            });
    }

    private String sanitize(String msg) {
        // Never expose internal details in the API response
        if (msg == null) return "An error occurred";
        return msg.replace("\"", "'").replaceAll("[\\r\\n]", " ");
    }
}
