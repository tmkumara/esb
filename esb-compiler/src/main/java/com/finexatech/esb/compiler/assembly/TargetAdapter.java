package com.finexatech.esb.compiler.assembly;

import com.finexatech.esb.spec.TargetSpec;
import org.apache.camel.Processor;

/**
 * Knows how to call one outbound protocol.
 *
 * To add a new target protocol:
 *   1. Create a class implementing this interface
 *   2. Annotate with @Component
 *   3. Return the protocol name from protocol()
 *
 * RouteAssembler discovers all implementations automatically via Spring DI.
 */
public interface TargetAdapter {

    /** Protocol key — must match target.type in the YAML spec */
    String protocol();

    /** Build the Camel "to" URI from the spec */
    String buildToUri(TargetSpec spec);

    /**
     * Processor to run BEFORE the target call.
     * Use for: setting protocol headers, auth, content-type.
     */
    default Processor preProcessor(TargetSpec spec) {
        return exchange -> {};   // no-op by default
    }

    /**
     * Processor to run AFTER the target call.
     * Use for: extracting data, checking error codes, normalising response.
     */
    default Processor postProcessor(TargetSpec spec) {
        return exchange -> {};   // no-op by default
    }
}
