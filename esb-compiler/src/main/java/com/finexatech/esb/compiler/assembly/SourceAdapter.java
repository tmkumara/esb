package com.finexatech.esb.compiler.assembly;

import com.finexatech.esb.spec.SourceSpec;
import org.apache.camel.model.RouteDefinition;

/**
 * Knows how to expose an inbound endpoint for one protocol.
 *
 * To add a new source protocol:
 *   1. Create a class implementing this interface
 *   2. Annotate with @Component
 *   3. Return the protocol name from protocol()
 *
 * RouteAssembler discovers all implementations automatically via Spring DI.
 */
public interface SourceAdapter {

    /** Protocol key — must match source.type in the YAML spec */
    String protocol();

    /** Build the Camel "from" URI from the spec */
    String buildFromUri(SourceSpec spec);

    /**
     * Apply any extra DSL configuration after the from() is set up.
     * Default: no-op. Override for REST verb binding, etc.
     */
    default void configure(RouteDefinition route, SourceSpec spec) {}
}
