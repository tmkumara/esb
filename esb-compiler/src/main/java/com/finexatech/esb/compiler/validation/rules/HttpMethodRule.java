package com.finexatech.esb.compiler.validation.rules;

import com.finexatech.esb.compiler.validation.SpecRule;
import com.finexatech.esb.compiler.validation.ValidationLayer;
import com.finexatech.esb.compiler.validation.ValidationMessage;
import com.finexatech.esb.spec.RouteSpec;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;

/**
 * L1 Structural: REST source must have a valid HTTP method.
 */
@Component
public class HttpMethodRule implements SpecRule {

    private static final Set<String> VALID_METHODS =
        Set.of("GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS");

    @Override
    public ValidationLayer layer()  { return ValidationLayer.STRUCTURAL; }

    @Override
    public String ruleId()          { return "HTTP_METHOD"; }

    @Override
    public boolean appliesTo(RouteSpec spec) {
        return spec.getSource() != null && "rest".equals(spec.getSource().getType());
    }

    @Override
    public List<ValidationMessage> check(RouteSpec spec) {
        String method = spec.getSource().getMethod();
        if (method == null || method.isBlank()) {
            return List.of(ValidationMessage.error(ruleId(), layer(),
                "source.method", "HTTP method is required for REST source"));
        }
        if (!VALID_METHODS.contains(method.toUpperCase())) {
            return List.of(ValidationMessage.error(ruleId(), layer(),
                "source.method",
                "Invalid HTTP method '%s'. Must be one of: %s".formatted(method, VALID_METHODS)));
        }
        return List.of();
    }
}
