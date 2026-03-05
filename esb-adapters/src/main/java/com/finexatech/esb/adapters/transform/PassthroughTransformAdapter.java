package com.finexatech.esb.adapters.transform;

import com.finexatech.esb.compiler.assembly.TransformAdapter;
import com.finexatech.esb.spec.TransformItemSpec;
import org.apache.camel.Processor;
import org.springframework.stereotype.Component;

/**
 * No-op transform — passes the message body through unchanged.
 * Default when no transform is specified in the YAML.
 *
 * YAML: transform.request.type = "passthrough"
 */
@Component
public class PassthroughTransformAdapter implements TransformAdapter {

    @Override
    public String type() { return "passthrough"; }

    @Override
    public Processor buildProcessor(TransformItemSpec spec) {
        return exchange -> {};   // nothing to do
    }
}
