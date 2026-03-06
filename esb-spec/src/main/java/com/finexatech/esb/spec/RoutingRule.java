package com.finexatech.esb.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.ArrayList;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class RoutingRule {
    private String id;
    private ExpressionSpec condition;
    private List<StepSpec> steps = new ArrayList<>();  // pre-steps before this rule's target
    private TargetSpec target;
    @JsonProperty("default")
    private boolean isDefault;

    public String getId()               { return id; }
    public void setId(String id)        { this.id = id; }

    public ExpressionSpec getCondition()               { return condition; }
    public void setCondition(ExpressionSpec condition) { this.condition = condition; }

    public List<StepSpec> getSteps()            { return steps; }
    public void setSteps(List<StepSpec> steps)  { this.steps = steps != null ? steps : new ArrayList<>(); }

    public TargetSpec getTarget()               { return target; }
    public void setTarget(TargetSpec target)    { this.target = target; }

    public boolean isDefault()              { return isDefault; }
    public void setDefault(boolean isDefault){ this.isDefault = isDefault; }
}
