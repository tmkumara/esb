package com.finexatech.esb.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class RetrySpec {
    private int maxAttempts    = 3;
    private String backoffType = "exponential";   // fixed | exponential
    private long initialDelayMs = 1000;
    private double multiplier   = 2.0;
    private long maxDelayMs     = 30000;
    private List<String> retryOn      = List.of("CONNECTION_REFUSED", "HTTP_503", "TIMEOUT");
    private List<String> doNotRetryOn = List.of("HTTP_400", "HTTP_401", "HTTP_403", "HTTP_404");

    public int getMaxAttempts() { return maxAttempts; }
    public void setMaxAttempts(int maxAttempts) { this.maxAttempts = maxAttempts; }
    public String getBackoffType() { return backoffType; }
    public void setBackoffType(String backoffType) { this.backoffType = backoffType; }
    public long getInitialDelayMs() { return initialDelayMs; }
    public void setInitialDelayMs(long initialDelayMs) { this.initialDelayMs = initialDelayMs; }
    public double getMultiplier() { return multiplier; }
    public void setMultiplier(double multiplier) { this.multiplier = multiplier; }
    public long getMaxDelayMs() { return maxDelayMs; }
    public void setMaxDelayMs(long maxDelayMs) { this.maxDelayMs = maxDelayMs; }
    public List<String> getRetryOn() { return retryOn; }
    public void setRetryOn(List<String> retryOn) { this.retryOn = retryOn; }
    public List<String> getDoNotRetryOn() { return doNotRetryOn; }
    public void setDoNotRetryOn(List<String> doNotRetryOn) { this.doNotRetryOn = doNotRetryOn; }
}
