package com.finexatech.esb.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * Represents one step inside a process.steps[] or routing rule pre-steps list.
 * type: set-header | log | script | route-to | split | wire-tap
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class StepSpec {
    private String id;
    private String type;           // set-header | log | script | route-to | split | wire-tap

    // set-header
    private String name;           // header name
    private ExpressionSpec expression;

    // log
    private String message;
    private String level;          // INFO | WARN | ERROR | DEBUG

    // script
    private String language;       // groovy
    private String inline;

    // route-to / wire-tap / split
    private String destination;    // direct:route-name

    // split
    private boolean parallelProcessing;
    private long timeout;
    private boolean stopOnException;
    private List<StepSpec> steps = new ArrayList<>(); // nested steps inside split

    public String getId()           { return id; }
    public void setId(String id)    { this.id = id; }

    public String getType()         { return type; }
    public void setType(String type){ this.type = type; }

    public String getName()         { return name; }
    public void setName(String name){ this.name = name; }

    public ExpressionSpec getExpression()              { return expression; }
    public void setExpression(ExpressionSpec expression){ this.expression = expression; }

    public String getMessage()          { return message; }
    public void setMessage(String message){ this.message = message; }

    public String getLevel()            { return level; }
    public void setLevel(String level)  { this.level = level; }

    public String getLanguage()             { return language; }
    public void setLanguage(String language){ this.language = language; }

    public String getInline()           { return inline; }
    public void setInline(String inline){ this.inline = inline; }

    public String getDestination()              { return destination; }
    public void setDestination(String destination){ this.destination = destination; }

    public boolean isParallelProcessing()               { return parallelProcessing; }
    public void setParallelProcessing(boolean v)        { this.parallelProcessing = v; }

    public long getTimeout()        { return timeout; }
    public void setTimeout(long timeout){ this.timeout = timeout; }

    public boolean isStopOnException()          { return stopOnException; }
    public void setStopOnException(boolean v)   { this.stopOnException = v; }

    public List<StepSpec> getSteps()            { return steps; }
    public void setSteps(List<StepSpec> steps)  { this.steps = steps != null ? steps : new ArrayList<>(); }
}
