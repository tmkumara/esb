package com.finexatech.esb.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.ArrayList;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class RoutingSpec {
    private String type;                  // content-based
    private List<RoutingRule> rules = new ArrayList<>();

    public String getType()             { return type; }
    public void setType(String type)    { this.type = type; }

    public List<RoutingRule> getRules()             { return rules; }
    public void setRules(List<RoutingRule> rules)   { this.rules = rules != null ? rules : new ArrayList<>(); }
}
