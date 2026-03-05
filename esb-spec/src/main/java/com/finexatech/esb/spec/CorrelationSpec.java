package com.finexatech.esb.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class CorrelationSpec {
    private String header = "X-Correlation-ID";
    private boolean generateIfMissing = true;
    private boolean propagateToTarget = true;

    public String getHeader() { return header; }
    public void setHeader(String header) { this.header = header; }
    public boolean isGenerateIfMissing() { return generateIfMissing; }
    public void setGenerateIfMissing(boolean generateIfMissing) { this.generateIfMissing = generateIfMissing; }
    public boolean isPropagateToTarget() { return propagateToTarget; }
    public void setPropagateToTarget(boolean propagateToTarget) { this.propagateToTarget = propagateToTarget; }
}
