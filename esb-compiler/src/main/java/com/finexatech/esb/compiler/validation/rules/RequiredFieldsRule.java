package com.finexatech.esb.compiler.validation.rules;

import com.finexatech.esb.compiler.validation.SpecRule;
import com.finexatech.esb.compiler.validation.ValidationLayer;
import com.finexatech.esb.compiler.validation.ValidationMessage;
import com.finexatech.esb.spec.RouteSpec;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * L1 Structural: checks all required top-level fields are present.
 */
@Component
public class RequiredFieldsRule implements SpecRule {

    @Override
    public ValidationLayer layer()  { return ValidationLayer.STRUCTURAL; }

    @Override
    public String ruleId()          { return "REQUIRED_FIELDS"; }

    @Override
    public boolean appliesTo(RouteSpec spec) { return true; }

    @Override
    public List<ValidationMessage> check(RouteSpec spec) {
        List<ValidationMessage> msgs = new ArrayList<>();

        if (spec.getMetadata() == null || isBlank(spec.getMetadata().getName())) {
            msgs.add(error("metadata.name", "Route name is required"));
        }
        if (spec.getSource() == null) {
            msgs.add(error("source", "source block is required"));
        } else {
            if (isBlank(spec.getSource().getType())) {
                msgs.add(error("source.type", "source.type is required"));
            }
        }
        if (spec.getTarget() == null) {
            msgs.add(error("target", "target block is required"));
        } else {
            if (isBlank(spec.getTarget().getType())) {
                msgs.add(error("target.type", "target.type is required"));
            }
            // mock-response and mock-echo carry their config inline — no endpointUrl needed
            String ttype = spec.getTarget().getType();
            boolean needsUrl = !"mock-response".equals(ttype) && !"mock-echo".equals(ttype);
            if (needsUrl && isBlank(spec.getTarget().getEndpointUrl())) {
                msgs.add(error("target.endpointUrl", "target.endpointUrl is required"));
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
