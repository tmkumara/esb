package com.finexatech.esb.spec;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * Root POJO for a Route Spec YAML file.
 *
 * Example:
 * <pre>
 *   apiVersion: esb/v1
 *   kind: RouteSpec
 *   metadata:
 *     name: customer-lookup
 *   source:
 *     type: rest
 *     method: GET
 *     path: /api/v1/customers/{id}
 *   target:
 *     type: soap
 *     endpointUrl: "${SOAP_URL}"
 *     operation: GetCustomer
 * </pre>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class RouteSpec {
    private String apiVersion;
    private String kind;
    private MetadataSpec metadata;
    private SourceSpec source;
    private TargetSpec target;
    private TransformSpec transform;
    private ProcessSpec process;
    private RoutingSpec routing;
    private CorrelationSpec correlation;
    private ErrorSpec errorHandling;

    public String getApiVersion() { return apiVersion; }
    public void setApiVersion(String apiVersion) { this.apiVersion = apiVersion; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public MetadataSpec getMetadata() { return metadata; }
    public void setMetadata(MetadataSpec metadata) { this.metadata = metadata; }
    public SourceSpec getSource() { return source; }
    public void setSource(SourceSpec source) { this.source = source; }
    public TargetSpec getTarget() { return target; }
    public void setTarget(TargetSpec target) { this.target = target; }

    public ProcessSpec getProcess()             { return process; }
    public void setProcess(ProcessSpec process) { this.process = process; }

    public RoutingSpec getRouting()             { return routing; }
    public void setRouting(RoutingSpec routing) { this.routing = routing; }

    public TransformSpec getTransform() {
        return transform != null ? transform : new TransformSpec();
    }
    public void setTransform(TransformSpec transform) { this.transform = transform; }

    public CorrelationSpec getCorrelation() {
        return correlation != null ? correlation : new CorrelationSpec();
    }
    public void setCorrelation(CorrelationSpec correlation) { this.correlation = correlation; }

    public ErrorSpec getErrorHandling() {
        return errorHandling != null ? errorHandling : new ErrorSpec();
    }
    public void setErrorHandling(ErrorSpec errorHandling) { this.errorHandling = errorHandling; }

    /** Convenience accessor used throughout the codebase */
    public String routeName() {
        return metadata != null ? metadata.getName() : "unnamed-route";
    }

    @Override
    public String toString() {
        return "RouteSpec{name='" + routeName() + "', source=" +
               (source != null ? source.getType() + ":" + source.getPath() : "null") +
               ", target=" + (target != null ? target.getType() : "null") + "}";
    }
}
