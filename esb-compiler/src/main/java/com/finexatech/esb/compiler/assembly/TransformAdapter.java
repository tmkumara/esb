package com.finexatech.esb.compiler.assembly;

import com.finexatech.esb.spec.TransformItemSpec;
import org.apache.camel.Processor;

/**
 * Knows how to apply one transformation type (XSLT, Jolt, Groovy, etc.).
 *
 * To add a new transform type:
 *   1. Create a class implementing this interface
 *   2. Annotate with @Component
 *   3. Return the type key from type()
 */
public interface TransformAdapter {

    /** Type key — must match transform.request.type / response.type in YAML */
    String type();

    /** Build a Camel Processor that applies this transformation */
    Processor buildProcessor(TransformItemSpec spec);
}
