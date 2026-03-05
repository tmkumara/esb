package com.finexatech.esb.compiler.assembly;

import com.finexatech.esb.spec.RouteSpec;
import org.apache.camel.builder.RouteBuilder;

/**
 * Cross-cutting concern applied to EVERY assembled route.
 *
 * Interceptors run in order() before the main route definition.
 * They configure error handling, retry, metrics, correlation, auth, etc.
 *
 * To add a new cross-cutting concern:
 *   1. Create a class implementing this interface
 *   2. Annotate with @Component
 *   3. Choose an appropriate order()
 */
public interface RouteInterceptor {

    /**
     * Execution order — lower runs first.
     * Convention: 10=error-handling, 20=auth, 30=retry, 40=metrics, 50=correlation
     */
    int order();

    /** Apply interceptor configuration to the route builder */
    void apply(RouteBuilder builder, RouteSpec spec);
}
