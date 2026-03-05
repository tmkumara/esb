package com.finexatech.esb.adapters.transform;

import com.bazaarvoice.jolt.Chainr;
import com.bazaarvoice.jolt.JsonUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finexatech.esb.compiler.assembly.TransformAdapter;
import com.finexatech.esb.spec.TransformItemSpec;
import org.apache.camel.Processor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.InputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * JSON → JSON transformation using Jolt declarative spec files.
 *
 * YAML: transform.request.type = "jolt"
 *       transform.request.resource = "classpath:jolt/my-transform.json"
 */
@Component
public class JoltTransformAdapter implements TransformAdapter {

    private static final Logger log = LoggerFactory.getLogger(JoltTransformAdapter.class);

    private final ObjectMapper objectMapper = new ObjectMapper();
    // Cache compiled Jolt specs — load once, reuse
    private final Map<String, Chainr> specCache = new ConcurrentHashMap<>();

    @Override
    public String type() { return "jolt"; }

    @Override
    public Processor buildProcessor(TransformItemSpec spec) {
        return exchange -> {
            String body = exchange.getIn().getBody(String.class);
            if (body == null || body.isBlank()) return;

            Chainr chainr;
            if (spec.getInline() != null && !spec.getInline().isBlank()) {
                chainr = Chainr.fromSpec(JsonUtils.jsonToObject(spec.getInline()));
            } else {
                chainr = loadSpec(spec.getResource());
            }
            Object input  = JsonUtils.jsonToObject(body);
            Object output = chainr.transform(input);
            String result = JsonUtils.toJsonString(output);

            exchange.getIn().setBody(result);
            exchange.getIn().setHeader("Content-Type", "application/json");
            log.debug("Jolt transform applied: {} chars → {} chars", body.length(), result.length());
        };
    }

    private Chainr loadSpec(String resource) {
        return specCache.computeIfAbsent(resource, path -> {
            try {
                log.info("Loading Jolt spec: {}", path);
                InputStream is;
                if (path.startsWith("classpath:")) {
                    String cp = path.substring("classpath:".length());
                    is = new ClassPathResource(cp).getInputStream();
                } else {
                    is = new java.io.FileInputStream(path);
                }
                Object spec = JsonUtils.jsonToObject(is);
                return Chainr.fromSpec(spec);
            } catch (Exception e) {
                throw new RuntimeException("Failed to load Jolt spec: " + path, e);
            }
        });
    }
}
