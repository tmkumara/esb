package com.finexatech.esb.adapters.source;

import com.finexatech.esb.compiler.assembly.SourceAdapter;
import com.finexatech.esb.spec.SourceSpec;
import org.apache.camel.model.RouteDefinition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Exposes a REST HTTP inbound endpoint.
 * Uses Camel's REST DSL configured via CamelRestConfig.
 *
 * YAML: source.type = "rest"
 */
@Component
public class RestSourceAdapter implements SourceAdapter {

    private static final Logger log = LoggerFactory.getLogger(RestSourceAdapter.class);

    @Override
    public String protocol() { return "rest"; }

    @Override
    public String buildFromUri(SourceSpec spec) {
        // Camel REST DSL URI format: rest:METHOD:path
        String method = (spec.getMethod() != null ? spec.getMethod() : "GET").toLowerCase();
        String path   = spec.getPath() != null ? spec.getPath() : "/";
        return "rest:%s:%s".formatted(method, path);
    }

    @Override
    public void configure(RouteDefinition route, SourceSpec spec) {
        // REST DSL global config is in CamelRestConfig.
        // Per-route: set content-type defaults
        log.debug("Configuring REST source for path: {}", spec.getPath());
    }
}
