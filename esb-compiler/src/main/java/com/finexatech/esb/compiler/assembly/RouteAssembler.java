package com.finexatech.esb.compiler.assembly;

import com.finexatech.esb.spec.RouteSpec;
import com.finexatech.esb.spec.TransformItemSpec;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.model.RouteDefinition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * THE IMMUTABLE CORE — this class must never be modified once written.
 *
 * Assembles a Camel RouteBuilder from a validated RouteSpec by:
 *   1. Selecting the correct SourceAdapter, TargetAdapter, TransformAdapters
 *   2. Applying all RouteInterceptors (error handling, retry, auth, metrics)
 *   3. Wiring: source → requestTransform → targetPreProcessor → target
 *                      → targetPostProcessor → responseTransform
 *
 * Adding a new protocol = add an adapter class. This class stays unchanged.
 */
@Component
public class RouteAssembler {

    private static final Logger log = LoggerFactory.getLogger(RouteAssembler.class);

    private final Map<String, SourceAdapter>    sourceAdapters;
    private final Map<String, TargetAdapter>    targetAdapters;
    private final Map<String, TransformAdapter> transformAdapters;
    private final List<RouteInterceptor>        interceptors;

    @Autowired
    public RouteAssembler(
            List<SourceAdapter>    sources,
            List<TargetAdapter>    targets,
            List<TransformAdapter> transforms,
            List<RouteInterceptor> interceptors) {

        this.sourceAdapters    = index(sources,    SourceAdapter::protocol);
        this.targetAdapters    = index(targets,    TargetAdapter::protocol);
        this.transformAdapters = index(transforms, TransformAdapter::type);
        this.interceptors      = interceptors.stream()
                                     .sorted(Comparator.comparingInt(RouteInterceptor::order))
                                     .collect(Collectors.toList());

        log.info("RouteAssembler ready — sources={}, targets={}, transforms={}, interceptors={}",
                sourceAdapters.keySet(), targetAdapters.keySet(),
                transformAdapters.keySet(), this.interceptors.size());
    }

    /**
     * Assemble a Camel RouteBuilder from a validated RouteSpec.
     * Call camelContext.addRoutes(assembler.assemble(spec)) to make it live.
     */
    public RouteBuilder assemble(RouteSpec spec) {
        log.info("Assembling route: {}", spec.routeName());

        SourceAdapter    src   = resolve(sourceAdapters,    spec.getSource().getType(),   "source");
        TargetAdapter    tgt   = resolve(targetAdapters,    spec.getTarget().getType(),   "target");
        TransformAdapter reqTx = resolve(transformAdapters, reqType(spec),  "transform");
        TransformAdapter resTx = resolve(transformAdapters, resType(spec), "transform");

        return new RouteBuilder() {
            @Override
            public void configure() {
                // Step 1: apply all interceptors (error handler, retry, correlation, metrics)
                // Each interceptor may add onException(), interceptFrom(), etc.
                interceptors.forEach(i -> i.apply(this, spec));

                // Step 2: build the main route
                //   from(sourceUri)
                //     → requestTransform
                //     → target preProcessor (set headers, auth)
                //     → to(targetUri)
                //     → target postProcessor (extract response, check errors)
                //     → responseTransform
                RouteDefinition route = from(src.buildFromUri(spec.getSource()))
                        .routeId(spec.routeName())
                        .process(reqTx.buildProcessor(spec.getTransform().getRequest()))
                        .process(tgt.preProcessor(spec.getTarget()))
                        .to(tgt.buildToUri(spec.getTarget()))
                        .process(tgt.postProcessor(spec.getTarget()))
                        .process(resTx.buildProcessor(spec.getTransform().getResponse()));

                // Step 3: source adapter may add extra DSL (REST verb binding, path params)
                src.configure(route, spec.getSource());

                log.info("Route assembled: {} — from={} to={}",
                        spec.routeName(),
                        src.buildFromUri(spec.getSource()),
                        tgt.buildToUri(spec.getTarget()));
            }
        };
    }

    /** List all registered source/target types — useful for the management API */
    public Map<String, SourceAdapter>    registeredSources()    { return sourceAdapters; }
    public Map<String, TargetAdapter>    registeredTargets()    { return targetAdapters; }
    public Map<String, TransformAdapter> registeredTransforms() { return transformAdapters; }

    // ── private helpers ────────────────────────────────────────────────────

    private <T> T resolve(Map<String, T> registry, String type, String role) {
        T adapter = registry.get(type);
        if (adapter == null) {
            throw new IllegalArgumentException(
                "No %s adapter registered for type '%s'. Available: %s"
                    .formatted(role, type, registry.keySet()));
        }
        return adapter;
    }

    private String reqType(RouteSpec spec) {
        TransformItemSpec req = spec.getTransform().getRequest();
        return req.getType();
    }

    private String resType(RouteSpec spec) {
        TransformItemSpec res = spec.getTransform().getResponse();
        return res.getType();
    }

    private <T> Map<String, T> index(List<T> list, Function<T, String> keyFn) {
        return list.stream().collect(Collectors.toMap(keyFn, Function.identity(),
                (a, b) -> { log.warn("Duplicate adapter key — keeping first: {}", a); return a; }));
    }
}
