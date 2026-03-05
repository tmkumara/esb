package com.finexatech.esb.compiler.validation;

import com.finexatech.esb.spec.RouteSpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Runs all registered SpecRules in layer order.
 * Stops advancing to the next layer if the current layer has ERROR-level messages.
 */
@Component
public class ValidationPipeline {

    private static final Logger log = LoggerFactory.getLogger(ValidationPipeline.class);

    private final List<SpecRule> rules;

    @Autowired
    public ValidationPipeline(List<SpecRule> rules) {
        this.rules = rules.stream()
            .sorted(Comparator.comparingInt(r -> r.layer().ordinal()))
            .toList();
        log.info("ValidationPipeline loaded {} rules", rules.size());
    }

    public ValidationReport validate(RouteSpec spec) {
        return validate(spec, ValidationLayer.SEMANTIC);  // default: up to semantic
    }

    public ValidationReport validate(RouteSpec spec, ValidationLayer upTo) {
        List<ValidationMessage> messages = new ArrayList<>();
        ValidationLayer reached = ValidationLayer.STRUCTURAL;

        for (ValidationLayer layer : ValidationLayer.values()) {
            if (layer.ordinal() > upTo.ordinal()) break;
            reached = layer;

            List<SpecRule> layerRules = rules.stream()
                .filter(r -> r.layer() == layer && r.appliesTo(spec))
                .toList();

            for (SpecRule rule : layerRules) {
                try {
                    List<ValidationMessage> result = rule.check(spec);
                    messages.addAll(result);
                } catch (Exception e) {
                    log.error("Rule {} threw exception — treating as ERROR", rule.ruleId(), e);
                    messages.add(ValidationMessage.error(rule.ruleId(), layer, "rule",
                        "Rule execution failed: " + e.getMessage()));
                }
            }

            boolean hasErrors = messages.stream()
                .filter(m -> m.getLayer() == layer)
                .anyMatch(ValidationMessage::isError);

            if (hasErrors) {
                log.warn("Validation stopped at layer {} due to errors in route '{}'",
                         layer, spec.routeName());
                break;
            }
        }

        ValidationReport report = ValidationReport.of(spec.routeName(), reached, messages);
        log.info("Validation complete for '{}': passed={}, errors={}, warnings={}",
                 spec.routeName(), report.isPassed(), report.errors().size(), report.warnings().size());
        return report;
    }
}
