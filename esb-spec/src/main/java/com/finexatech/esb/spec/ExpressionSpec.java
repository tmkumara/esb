package com.finexatech.esb.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class ExpressionSpec {
    private String language = "simple";   // simple | groovy | jsonpath | xpath | constant | header
    private String value;

    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public String getValue()    { return value; }
    public void setValue(String value) { this.value = value; }
}
