package com.finexatech.esb.compiler.assembly;

import com.finexatech.esb.spec.StepSpec;
import org.apache.camel.LoggingLevel;
import org.apache.camel.model.ProcessorDefinition;
import org.springframework.stereotype.Component;

/**
 * Applies a log step.
 *
 * YAML:
 *   type: log
 *   message: "Order ${header.X-Correlation-ID} arrived"
 *   level: INFO
 */
@Component
public class LogStepApplier implements StepApplier {

    @Override
    public String stepType() { return "log"; }

    @Override
    public void apply(ProcessorDefinition<?> def, StepSpec step) {
        String levelStr  = step.getLevel() != null ? step.getLevel().toUpperCase() : "INFO";
        LoggingLevel lvl = LoggingLevel.valueOf(levelStr);
        def.log(lvl, "ESB", step.getMessage() != null ? step.getMessage() : "");
    }
}
