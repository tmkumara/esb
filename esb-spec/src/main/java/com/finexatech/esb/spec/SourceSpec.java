package com.finexatech.esb.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class SourceSpec {
    private String type;     // rest | direct | jms | kafka | timer
    private String method;   // GET | POST | PUT | DELETE | PATCH
    private String path;     // /api/v1/customers/{id}
    private String name;     // for direct: source
    private String consumes;
    private String produces;
    private AuthSpec auth;
    private long periodMs;   // for timer: source — poll interval in ms (default 5000)

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }
    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getConsumes() { return consumes; }
    public void setConsumes(String consumes) { this.consumes = consumes; }
    public String getProduces() { return produces; }
    public void setProduces(String produces) { this.produces = produces; }
    public AuthSpec getAuth() { return auth; }
    public void setAuth(AuthSpec auth) { this.auth = auth; }
    public long getPeriodMs() { return periodMs; }
    public void setPeriodMs(long periodMs) { this.periodMs = periodMs; }
}
