package com.finexatech.esb.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.ArrayList;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class ProcessSpec {
    private List<StepSpec> steps = new ArrayList<>();

    public List<StepSpec> getSteps()            { return steps; }
    public void setSteps(List<StepSpec> steps)  { this.steps = steps != null ? steps : new ArrayList<>(); }
}
