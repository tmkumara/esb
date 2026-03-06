package com.finexatech.esb.compiler.assembly;

import com.finexatech.esb.spec.ExpressionSpec;
import org.apache.camel.Exchange;
import org.apache.camel.Expression;
import org.apache.camel.Predicate;

import static org.apache.camel.builder.Builder.*;

/**
 * Utility methods to convert ExpressionSpec → Camel Expression / Predicate.
 *
 * Uses BuilderSupport static factory methods for simple/constant/header,
 * and a runtime-resolving lambda for jsonpath/xpath (avoids compile-time
 * dependency on camel-jsonpath or camel-xml-jaxp in esb-compiler).
 */
final class EsbExpressionHelper {

    private EsbExpressionHelper() {}

    static Expression buildExpression(ExpressionSpec spec) {
        if (spec == null) return constant("");
        String lang = spec.getLanguage() != null ? spec.getLanguage() : "simple";
        String val  = spec.getValue()    != null ? spec.getValue()    : "";
        return switch (lang) {
            case "constant" -> constant(val);
            case "header"   -> header(val);
            case "jsonpath", "xpath" -> runtimeLanguageExpression(lang, val);
            default -> simple(val);  // "simple" (also catches groovy if needed)
        };
    }

    static Predicate buildPredicate(ExpressionSpec spec) {
        if (spec == null) return simple("true");
        String lang = spec.getLanguage() != null ? spec.getLanguage() : "simple";
        String val  = spec.getValue()    != null ? spec.getValue()    : "";
        return switch (lang) {
            case "header"   -> header(val);
            case "jsonpath", "xpath" -> runtimeLanguagePredicate(lang, val);
            default -> simple(val);
        };
    }

    /**
     * Creates an Expression that delegates to a Camel language resolved at
     * runtime from the CamelContext — allows jsonpath/xpath without
     * compile-time dependencies in esb-compiler.
     */
    private static Expression runtimeLanguageExpression(String language, String expression) {
        return new Expression() {
            // cache the resolved delegate once
            private volatile Expression delegate;

            @Override
            public <T> T evaluate(Exchange exchange, Class<T> type) {
                if (delegate == null) {
                    delegate = exchange.getContext()
                            .resolveLanguage(language)
                            .createExpression(expression);
                }
                return delegate.evaluate(exchange, type);
            }

            @Override public String toString() { return language + ":" + expression; }
        };
    }

    private static Predicate runtimeLanguagePredicate(String language, String expression) {
        return new Predicate() {
            private volatile Predicate delegate;

            @Override
            public boolean matches(Exchange exchange) {
                if (delegate == null) {
                    delegate = exchange.getContext()
                            .resolveLanguage(language)
                            .createPredicate(expression);
                }
                return delegate.matches(exchange);
            }

            @Override public String toString() { return language + ":" + expression; }
        };
    }
}
