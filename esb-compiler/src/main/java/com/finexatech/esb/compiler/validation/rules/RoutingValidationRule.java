package com.finexatech.esb.compiler.validation.rules;

import com.finexatech.esb.compiler.validation.SpecRule;
import com.finexatech.esb.compiler.validation.ValidationLayer;
import com.finexatech.esb.compiler.validation.ValidationMessage;
import com.finexatech.esb.spec.RoutingRule;
import com.finexatech.esb.spec.RoutingSpec;
import com.finexatech.esb.spec.RouteSpec;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * L1 Structural: validates the routing: block when present.
 *
 * Checks:
 * 1. routing.type must be "content-based"
 * 2. routing.rules must not be empty
 * 3. exactly one rule must have default: true
 * 4. non-default rules must have a condition
 * 5. all rules must have a target with type
 */
@Component
public class RoutingValidationRule implements SpecRule {

    @Override
    public ValidationLayer layer()              { return ValidationLayer.STRUCTURAL; }

    @Override
    public String ruleId()                      { return "ROUTING_VALIDATION"; }

    @Override
    public boolean appliesTo(RouteSpec spec)    { return spec.getRouting() != null; }

    @Override
    public List<ValidationMessage> check(RouteSpec spec) {
        List<ValidationMessage> msgs = new ArrayList<>();
        RoutingSpec routing = spec.getRouting();

        if (isBlank(routing.getType())) {
            msgs.add(error("routing.type", "routing.type is required"));
            return msgs;
        }
        if (!"content-based".equals(routing.getType())) {
            msgs.add(error("routing.type",
                    "Unsupported routing type '" + routing.getType() +
                    "'. Supported: content-based"));
            return msgs;
        }

        List<RoutingRule> rules = routing.getRules();
        if (rules == null || rules.isEmpty()) {
            msgs.add(error("routing.rules", "At least one routing rule is required"));
            return msgs;
        }

        long defaultCount = rules.stream().filter(RoutingRule::isDefault).count();
        if (defaultCount == 0) {
            msgs.add(error("routing.rules",
                    "content-based routing requires exactly one default rule (default: true)"));
        } else if (defaultCount > 1) {
            msgs.add(error("routing.rules",
                    "Only one rule may be marked default: true, found " + defaultCount));
        }

        for (int i = 0; i < rules.size(); i++) {
            RoutingRule rule = rules.get(i);
            String prefix = "routing.rules[" + i + "]";

            if (!rule.isDefault()) {
                if (rule.getCondition() == null || isBlank(rule.getCondition().getValue())) {
                    msgs.add(error(prefix + ".condition",
                            "Non-default routing rule must have a condition.value"));
                }
            }

            if (rule.getTarget() == null) {
                msgs.add(error(prefix + ".target", "Routing rule must have a target block"));
            } else if (isBlank(rule.getTarget().getType())) {
                msgs.add(error(prefix + ".target.type", "Routing rule target.type is required"));
            }
        }

        return msgs;
    }

    private ValidationMessage error(String field, String message) {
        return ValidationMessage.error(ruleId(), layer(), field, message);
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
