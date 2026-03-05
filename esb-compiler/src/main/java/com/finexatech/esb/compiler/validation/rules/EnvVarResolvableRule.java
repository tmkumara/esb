package com.finexatech.esb.compiler.validation.rules;

import com.finexatech.esb.compiler.validation.SpecRule;
import com.finexatech.esb.compiler.validation.ValidationLayer;
import com.finexatech.esb.compiler.validation.ValidationMessage;
import com.finexatech.esb.spec.RouteSpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * L3 Semantic: all ${ENV_VAR} references in the spec must be resolvable.
 * Catches missing environment variables at validation time, not at runtime.
 */
@Component
public class EnvVarResolvableRule implements SpecRule {

    private static final Logger  log     = LoggerFactory.getLogger(EnvVarResolvableRule.class);
    private static final Pattern ENV_VAR = Pattern.compile("\\$\\{([^}]+)}");

    @Override
    public ValidationLayer layer()  { return ValidationLayer.SEMANTIC; }

    @Override
    public String ruleId()          { return "ENV_VAR_RESOLVABLE"; }

    @Override
    public boolean appliesTo(RouteSpec spec) { return spec.getTarget() != null; }

    @Override
    public List<ValidationMessage> check(RouteSpec spec) {
        List<ValidationMessage> msgs = new ArrayList<>();

        checkValue(spec.getTarget().getEndpointUrl(), "target.endpointUrl", msgs);

        if (spec.getTarget().getAuth() != null) {
            checkValue(spec.getTarget().getAuth().getUsername(), "target.auth.username", msgs);
            checkValue(spec.getTarget().getAuth().getPassword(), "target.auth.password", msgs);
        }

        return msgs;
    }

    private void checkValue(String value, String field, List<ValidationMessage> msgs) {
        if (value == null) return;

        Matcher matcher = ENV_VAR.matcher(value);
        while (matcher.find()) {
            String varName = matcher.group(1);
            String resolved = System.getenv(varName);

            if (resolved == null) {
                resolved = System.getProperty(varName);
            }

            if (resolved == null) {
                log.warn("Env var not set: {}", varName);
                msgs.add(ValidationMessage.warning(
                    ruleId(), layer(), field,
                    "Environment variable '${" + varName + "}' is not set",
                    "Set the environment variable or add it to application.yaml under the key: " + varName
                ));
            }
        }
    }
}
