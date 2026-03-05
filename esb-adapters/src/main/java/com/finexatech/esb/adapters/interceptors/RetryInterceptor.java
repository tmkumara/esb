package com.finexatech.esb.adapters.interceptors;

import com.finexatech.esb.compiler.assembly.RouteInterceptor;
import com.finexatech.esb.spec.RetrySpec;
import com.finexatech.esb.spec.RouteSpec;
import org.apache.camel.builder.RouteBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.ConnectException;
import java.net.SocketTimeoutException;

/**
 * Configures retry behaviour from the route spec.
 * Retry is applied at the route level — wraps the entire processing chain.
 *
 * Order 30 — after error handling (10), before correlation (50).
 */
@Component
public class RetryInterceptor implements RouteInterceptor {

    private static final Logger log = LoggerFactory.getLogger(RetryInterceptor.class);

    @Override
    public int order() { return 30; }

    @Override
    public void apply(RouteBuilder builder, RouteSpec spec) {
        if (spec.getTarget() == null || spec.getTarget().getRetry() == null) return;

        RetrySpec retry = spec.getTarget().getRetry();

        // Retry on network/transient errors only
        builder.onException(ConnectException.class, SocketTimeoutException.class, IOException.class)
            .maximumRedeliveries(retry.getMaxAttempts() - 1)
            .redeliveryDelay(retry.getInitialDelayMs())
            .backOffMultiplier(retry.getMultiplier())
            .maximumRedeliveryDelay(retry.getMaxDelayMs())
            .useExponentialBackOff()
            .retryAttemptedLogLevel(org.apache.camel.LoggingLevel.WARN)
            .onRedelivery(exchange -> {
                int attempt = exchange.getIn().getHeader("CamelRedeliveryCounter", Integer.class);
                log.warn("Retry attempt {} for route '{}' [correlationId={}]",
                         attempt, spec.routeName(),
                         exchange.getIn().getHeader("X-Correlation-ID"));
            });

        log.debug("Retry configured for '{}': maxAttempts={}, initialDelay={}ms",
                  spec.routeName(), retry.getMaxAttempts(), retry.getInitialDelayMs());
    }
}
