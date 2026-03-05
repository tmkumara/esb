package com.finexatech.esb.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class ErrorSpec {
    private String deadLetter = "direct:global-error-handler";
    private int fallbackHttpStatus = 500;
    private String fallbackBody = "{\"code\":\"INTERNAL_ERROR\",\"message\":\"An unexpected error occurred\"}";

    public String getDeadLetter() { return deadLetter; }
    public void setDeadLetter(String deadLetter) { this.deadLetter = deadLetter; }
    public int getFallbackHttpStatus() { return fallbackHttpStatus; }
    public void setFallbackHttpStatus(int fallbackHttpStatus) { this.fallbackHttpStatus = fallbackHttpStatus; }
    public String getFallbackBody() { return fallbackBody; }
    public void setFallbackBody(String fallbackBody) { this.fallbackBody = fallbackBody; }
}
