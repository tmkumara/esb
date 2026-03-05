package com.finexatech.esb.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class TimeoutSpec {
    private int connectMs = 5000;
    private int readMs    = 30000;

    public int getConnectMs() { return connectMs; }
    public void setConnectMs(int connectMs) { this.connectMs = connectMs; }
    public int getReadMs() { return readMs; }
    public void setReadMs(int readMs) { this.readMs = readMs; }
}
