package com.finexatech.esb.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
public class TargetSpec {
    private String type;          // soap | rest | jms | kafka | mock-response
    private String endpointUrl;   // resolved from ${ENV_VAR}
    private String method;        // for REST target: GET | POST | PUT | DELETE
    private String wsdl;          // classpath:wsdl/...
    private String operation;     // SOAP operation name
    private String service;
    private String port;
    private String destination;   // JMS queue/topic name
    private String mockBody;      // mock-response: static response body (JSON or XML)
    private int    mockStatusCode = 200; // mock-response: HTTP status code to return
    private AuthSpec auth;
    private TimeoutSpec timeout;
    private RetrySpec retry;
    private Map<String, String> params;  // extra component-specific params

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getEndpointUrl() { return endpointUrl; }
    public void setEndpointUrl(String endpointUrl) { this.endpointUrl = endpointUrl; }
    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }
    public String getWsdl() { return wsdl; }
    public void setWsdl(String wsdl) { this.wsdl = wsdl; }
    public String getOperation() { return operation; }
    public void setOperation(String operation) { this.operation = operation; }
    public String getService() { return service; }
    public void setService(String service) { this.service = service; }
    public String getPort() { return port; }
    public void setPort(String port) { this.port = port; }
    public String getDestination() { return destination; }
    public void setDestination(String destination) { this.destination = destination; }
    public String getMockBody() { return mockBody; }
    public void setMockBody(String mockBody) { this.mockBody = mockBody; }
    public int getMockStatusCode() { return mockStatusCode > 0 ? mockStatusCode : 200; }
    public void setMockStatusCode(int mockStatusCode) { this.mockStatusCode = mockStatusCode; }
    public AuthSpec getAuth() { return auth; }
    public void setAuth(AuthSpec auth) { this.auth = auth; }
    public TimeoutSpec getTimeout() { return timeout; }
    public void setTimeout(TimeoutSpec timeout) { this.timeout = timeout; }
    public RetrySpec getRetry() { return retry; }
    public void setRetry(RetrySpec retry) { this.retry = retry; }
    public Map<String, String> getParams() { return params; }
    public void setParams(Map<String, String> params) { this.params = params; }
}
