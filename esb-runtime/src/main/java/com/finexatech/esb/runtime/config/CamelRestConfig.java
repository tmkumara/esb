package com.finexatech.esb.runtime.config;

import org.apache.camel.builder.RouteBuilder;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Global Camel REST DSL configuration.
 * Configures REST engine, port, JSON binding, CORS, global error handler route.
 */
@Component
public class CamelRestConfig extends RouteBuilder {

    @Value("${server.port:8080}")
    private int serverPort;

    @Override
    public void configure() {

        // REST DSL global config — applies to all REST routes
        restConfiguration()
            .component("servlet")          // runs inside Spring Boot's embedded Tomcat
            .bindingMode(org.apache.camel.model.rest.RestBindingMode.off)  // we handle JSON manually
            .dataFormatProperty("prettyPrint", "true")
            .enableCORS(true)
            .host("0.0.0.0")
            .port(serverPort)
            .contextPath("/api");

        // Global dead-letter / error handler route
        // All route error handlers forward here on unrecoverable failure
        from("direct:global-error-handler")
            .routeId("global-error-handler")
            .log("Global error handler received message from route: ${header.CamelRouteId}")
            .to("log:esb.errors?level=ERROR&showBody=true&showHeaders=true");
    }
}
