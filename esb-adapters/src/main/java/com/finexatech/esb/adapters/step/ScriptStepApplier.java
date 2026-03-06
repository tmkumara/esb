package com.finexatech.esb.adapters.step;

import com.finexatech.esb.compiler.assembly.StepApplier;
import com.finexatech.esb.spec.StepSpec;
import groovy.lang.GroovyShell;
import org.apache.camel.model.ProcessorDefinition;
import org.springframework.stereotype.Component;

/**
 * Applies an inline Groovy script step as a Camel Processor.
 *
 * Placed in esb-adapters (not esb-compiler) because esb-adapters already
 * has the Groovy runtime dependency.
 *
 * YAML:
 *   type: script
 *   language: groovy
 *   inline: |
 *     headers['X-Enriched'] = 'true'
 *
 * Variables available: body (String), headers (Map), exchange (Exchange).
 * The script return value becomes the new body (null = unchanged).
 */
@Component
public class ScriptStepApplier implements StepApplier {

    @Override
    public String stepType() { return "script"; }

    @Override
    public void apply(ProcessorDefinition<?> def, StepSpec step) {
        String script = step.getInline() != null ? step.getInline() : "";
        def.process(exchange -> {
            GroovyShell shell = new GroovyShell();
            shell.setVariable("exchange", exchange);
            shell.setVariable("body",    exchange.getIn().getBody(String.class));
            shell.setVariable("headers", exchange.getIn().getHeaders());
            Object result = shell.evaluate(script);
            if (result != null) {
                exchange.getIn().setBody(result.toString());
            }
        });
    }
}
