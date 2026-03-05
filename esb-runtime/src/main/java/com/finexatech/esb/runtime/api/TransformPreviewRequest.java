package com.finexatech.esb.runtime.api;

import java.util.Map;

public class TransformPreviewRequest {
    private String type;                    // jolt | xslt | groovy
    private String spec;                    // the spec/script/stylesheet
    private String input;                   // sample input string
    private Map<String, String> headers;    // sample headers (groovy preview only)

    public String getType()  { return type; }
    public void setType(String type)   { this.type = type; }
    public String getSpec()  { return spec; }
    public void setSpec(String spec)   { this.spec = spec; }
    public String getInput() { return input; }
    public void setInput(String input) { this.input = input; }
    public Map<String, String> getHeaders() { return headers != null ? headers : Map.of(); }
    public void setHeaders(Map<String, String> headers) { this.headers = headers; }
}
