package com.finexatech.esb.compiler.assembly;

import com.finexatech.esb.spec.StepSpec;
import org.apache.camel.model.ProcessorDefinition;
import org.springframework.stereotype.Component;

/**
 * Applies a set-header step: sets a named header to the result of an expression.
 *
 * YAML:
 *   type: set-header
 *   name: X-Order-Class
 *   expression:
 *     language: simple
 *     value: "${body.amount} > 1000000 ? 'LARGE' : 'STANDARD'"
 */
@Component
public class SetHeaderStepApplier implements StepApplier {

    @Override
    public String stepType() { return "set-header"; }

    @Override
    public void apply(ProcessorDefinition<?> def, StepSpec step) {
        def.setHeader(step.getName(),
                EsbExpressionHelper.buildExpression(step.getExpression()));
    }
}
