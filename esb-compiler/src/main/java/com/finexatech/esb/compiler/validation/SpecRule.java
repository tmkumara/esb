package com.finexatech.esb.compiler.validation;

import com.finexatech.esb.spec.RouteSpec;
import java.util.List;

/**
 * One focused validation rule.
 *
 * To add a new validation rule:
 *   1. Create a class implementing this interface
 *   2. Annotate with @Component
 *   3. Return the appropriate layer() — rules run in layer order
 */
public interface SpecRule {
    ValidationLayer layer();
    String          ruleId();
    boolean         appliesTo(RouteSpec spec);
    List<ValidationMessage> check(RouteSpec spec);
}
