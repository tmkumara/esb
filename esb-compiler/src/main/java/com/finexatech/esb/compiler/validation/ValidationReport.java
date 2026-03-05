package com.finexatech.esb.compiler.validation;

import java.util.List;

public class ValidationReport {
    private final String          routeName;
    private final ValidationLayer layerReached;
    private final boolean         passed;
    private final List<ValidationMessage> messages;

    private ValidationReport(String routeName, ValidationLayer layerReached,
                               boolean passed, List<ValidationMessage> messages) {
        this.routeName    = routeName;
        this.layerReached = layerReached;
        this.passed       = passed;
        this.messages     = messages;
    }

    public static ValidationReport of(String routeName, ValidationLayer layer,
                                       List<ValidationMessage> messages) {
        boolean passed = messages.stream().noneMatch(ValidationMessage::isError);
        return new ValidationReport(routeName, layer, passed, messages);
    }

    public String              getRouteName()    { return routeName; }
    public ValidationLayer     getLayerReached() { return layerReached; }
    public boolean             isPassed()        { return passed; }
    public List<ValidationMessage> getMessages() { return messages; }

    public List<ValidationMessage> errors() {
        return messages.stream().filter(ValidationMessage::isError).toList();
    }

    public List<ValidationMessage> warnings() {
        return messages.stream()
            .filter(m -> m.getSeverity() == ValidationMessage.Severity.WARNING).toList();
    }

    @Override
    public String toString() {
        return "ValidationReport{route='%s', passed=%b, errors=%d, warnings=%d}"
            .formatted(routeName, passed, errors().size(), warnings().size());
    }
}
