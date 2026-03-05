package com.finexatech.esb.compiler.validation;

public class ValidationMessage {
    public enum Severity { ERROR, WARNING, HINT }

    private final String      ruleId;
    private final ValidationLayer layer;
    private final String      field;
    private final String      message;
    private final String      suggestion;
    private final Severity    severity;

    private ValidationMessage(String ruleId, ValidationLayer layer, String field,
                               String message, String suggestion, Severity severity) {
        this.ruleId     = ruleId;
        this.layer      = layer;
        this.field      = field;
        this.message    = message;
        this.suggestion = suggestion;
        this.severity   = severity;
    }

    public static ValidationMessage error(String ruleId, ValidationLayer layer,
                                           String field, String message) {
        return new ValidationMessage(ruleId, layer, field, message, null, Severity.ERROR);
    }

    public static ValidationMessage warning(String ruleId, ValidationLayer layer,
                                             String field, String message, String suggestion) {
        return new ValidationMessage(ruleId, layer, field, message, suggestion, Severity.WARNING);
    }

    public static ValidationMessage hint(String ruleId, ValidationLayer layer,
                                          String field, String message) {
        return new ValidationMessage(ruleId, layer, field, message, null, Severity.HINT);
    }

    public String getRuleId()     { return ruleId; }
    public ValidationLayer getLayer()  { return layer; }
    public String getField()      { return field; }
    public String getMessage()    { return message; }
    public String getSuggestion() { return suggestion; }
    public Severity getSeverity() { return severity; }
    public boolean isError()      { return severity == Severity.ERROR; }

    @Override
    public String toString() {
        return "[%s] %s.%s: %s".formatted(severity, layer, ruleId, message);
    }
}
