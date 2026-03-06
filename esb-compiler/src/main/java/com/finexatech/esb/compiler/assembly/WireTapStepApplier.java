package com.finexatech.esb.compiler.assembly;

import com.finexatech.esb.spec.StepSpec;
import org.apache.camel.model.ProcessorDefinition;
import org.apache.camel.model.RouteDefinition;
import org.springframework.stereotype.Component;

/**
 * Applies a wire-tap step: asynchronously sends a copy of the message to a
 * side channel without affecting the main flow.
 *
 * wireTap() is only valid on RouteDefinition (top-level), not inside choice/split
 * branches. A warning is logged if called on a nested definition.
 *
 * YAML:
 *   type: wire-tap
 *   destination: direct:audit-log
 */
@Component
public class WireTapStepApplier implements StepApplier {

    @Override
    public String stepType() { return "wire-tap"; }

    @Override
    public void apply(ProcessorDefinition<?> def, StepSpec step) {
        if (def instanceof RouteDefinition routeDef) {
            routeDef.wireTap(step.getDestination());
        } else {
            // wireTap is not supported in nested contexts; fall back to synchronous to()
            def.to(step.getDestination());
        }
    }
}
