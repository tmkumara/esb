package com.finexatech.esb.compiler.assembly;

import com.finexatech.esb.spec.StepSpec;
import org.apache.camel.model.ProcessorDefinition;
import org.apache.camel.model.SplitDefinition;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Applies a split step: iterates over a collection expression, routing each
 * element to a destination or through nested steps.
 *
 * YAML:
 *   type: split
 *   expression:
 *     language: jsonpath
 *     value: "$.orders"
 *   parallelProcessing: true
 *   timeout: 60000
 *   destination: direct:submit-single-order
 */
@Component
public class SplitStepApplier implements StepApplier {

    private final Map<String, StepApplier> stepRegistry;

    @Autowired
    public SplitStepApplier(List<StepApplier> allAppliers) {
        // Build registry excluding self to avoid circular reference
        this.stepRegistry = allAppliers.stream()
                .filter(a -> !"split".equals(a.stepType()))
                .collect(Collectors.toMap(StepApplier::stepType, Function.identity()));
    }

    @Override
    public String stepType() { return "split"; }

    @Override
    public void apply(ProcessorDefinition<?> def, StepSpec step) {
        SplitDefinition split = def.split(
                EsbExpressionHelper.buildExpression(step.getExpression()));

        if (step.isParallelProcessing()) {
            split.parallelProcessing();
            // timeout only valid when parallelProcessing=true (Camel 4 rule)
            if (step.getTimeout() > 0) split.timeout(step.getTimeout());
        }
        if (step.isStopOnException()) split.stopOnException();

        if (step.getDestination() != null) {
            split.to(step.getDestination());
        } else if (!step.getSteps().isEmpty()) {
            for (StepSpec nested : step.getSteps()) {
                StepApplier applier = stepRegistry.get(nested.getType());
                if (applier == null) {
                    throw new IllegalArgumentException(
                            "Unknown step type inside split: " + nested.getType());
                }
                applier.apply(split, nested);
            }
        }

        split.end();
    }
}
