package com.finexatech.esb.compiler.assembly;

import com.finexatech.esb.spec.StepSpec;
import org.apache.camel.model.ProcessorDefinition;
import org.springframework.stereotype.Component;

/**
 * Applies a route-to step: forwards the message to another Camel endpoint/route.
 *
 * YAML:
 *   type: route-to
 *   destination: direct:validate-order
 */
@Component
public class RouteToStepApplier implements StepApplier {

    @Override
    public String stepType() { return "route-to"; }

    @Override
    public void apply(ProcessorDefinition<?> def, StepSpec step) {
        def.to(step.getDestination());
    }
}
