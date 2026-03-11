package com.finexatech.esb.adapters.target;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.finexatech.esb.compiler.assembly.TargetAdapter;
import com.finexatech.esb.spec.TargetSpec;
import com.finexatech.esb.spec.TimeoutSpec;
import org.apache.camel.Exchange;
import org.apache.camel.Processor;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Map;

/**
 * Calls any REST/HTTP endpoint.
 *
 * YAML: target.type = "http"
 */
@Component
public class RestTargetAdapter implements TargetAdapter {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String protocol() { return "http"; }

    @Override
    public String buildToUri(TargetSpec spec) {
        String url     = resolve(spec.getEndpointUrl());
        TimeoutSpec to = spec.getTimeout() != null ? spec.getTimeout() : new TimeoutSpec();
        String scheme  = url.startsWith("https") ? "https" : "http";
        String hostPath = url.replaceFirst("^https?://", "");
        // bridgeEndpoint=true: don't append source path to target URL
        return "%s://%s?throwExceptionOnFailure=false&bridgeEndpoint=true&connectTimeout=%d&socketTimeout=%d"
            .formatted(scheme, hostPath, to.getConnectMs(), to.getReadMs());
    }

    @Override
    public Processor preProcessor(TargetSpec spec) {
        return exchange -> {
            String method = spec.getMethod() != null ? spec.getMethod().toUpperCase() : "POST";
            exchange.getIn().setHeader(Exchange.HTTP_METHOD, method);
            exchange.getIn().setHeader("Content-Type", "application/json");
            exchange.getIn().setHeader("Accept", "application/json");

            // Auto-serialize Map/List bodies to JSON string.
            // After a JSONPath split, each element is a LinkedHashMap — the HTTP
            // component cannot convert that to InputStream directly.
            Object body = exchange.getIn().getBody();
            if (body instanceof Map || body instanceof Collection) {
                exchange.getIn().setBody(MAPPER.writeValueAsString(body));
            }
        };
    }

    private String resolve(String value) {
        if (value == null) return "";
        if (value.startsWith("${") && value.endsWith("}")) {
            String key = value.substring(2, value.length() - 1);
            String env = System.getenv(key);
            return env != null ? env : System.getProperty(key, value);
        }
        return value;
    }
}
