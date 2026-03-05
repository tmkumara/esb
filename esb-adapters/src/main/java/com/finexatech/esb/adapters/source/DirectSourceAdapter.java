package com.finexatech.esb.adapters.source;

import com.finexatech.esb.compiler.assembly.SourceAdapter;
import com.finexatech.esb.spec.SourceSpec;
import org.springframework.stereotype.Component;

/**
 * Internal route — not HTTP-exposed. Routes call each other via direct:.
 * Enables multi-hop pipelines.
 *
 * YAML: source.type = "direct"
 */
@Component
public class DirectSourceAdapter implements SourceAdapter {

    @Override
    public String protocol() { return "direct"; }

    @Override
    public String buildFromUri(SourceSpec spec) {
        String name = spec.getName() != null ? spec.getName() : spec.getPath();
        return "direct:" + name;
    }
}
