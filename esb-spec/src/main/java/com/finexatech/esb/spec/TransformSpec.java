package com.finexatech.esb.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class TransformSpec {
    private TransformItemSpec request;
    private TransformItemSpec response;

    public TransformItemSpec getRequest() {
        return request != null ? request : defaultPassthrough();
    }
    public void setRequest(TransformItemSpec request) { this.request = request; }

    public TransformItemSpec getResponse() {
        return response != null ? response : defaultPassthrough();
    }
    public void setResponse(TransformItemSpec response) { this.response = response; }

    private TransformItemSpec defaultPassthrough() {
        TransformItemSpec pt = new TransformItemSpec();
        pt.setType("passthrough");
        return pt;
    }
}
