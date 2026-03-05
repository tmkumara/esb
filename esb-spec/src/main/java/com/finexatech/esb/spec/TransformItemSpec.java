package com.finexatech.esb.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public class TransformItemSpec {
    private String type;      // xslt | jolt | groovy | passthrough
    private String resource;  // classpath:jolt/my-transform.json
    private String inline;    // for inline scripts/expressions

    public String getType() { return type != null ? type : "passthrough"; }
    public void setType(String type) { this.type = type; }
    public String getResource() { return resource; }
    public void setResource(String resource) { this.resource = resource; }
    public String getInline() { return inline; }
    public void setInline(String inline) { this.inline = inline; }
}
