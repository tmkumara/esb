package com.finexatech.esb.compiler.assembly;

import com.finexatech.esb.spec.StepSpec;
import org.apache.camel.model.ProcessorDefinition;

/**
 * Strategy for applying one YAML step type to a Camel ProcessorDefinition.
 *
 * To add a new step type:
 *   1. Implement this interface
 *   2. Annotate with @Component
 *   3. stepType() must match the YAML "type:" value
 */
public interface StepApplier {
    /** The YAML step type this applier handles (e.g. "set-header"). */
    String stepType();

    /**
     * Apply the step to the given Camel definition chain.
     * @param def  current chain (RouteDefinition, SplitDefinition, WhenDefinition, etc.)
     * @param step the step spec from YAML
     */
    void apply(ProcessorDefinition<?> def, StepSpec step);
}
