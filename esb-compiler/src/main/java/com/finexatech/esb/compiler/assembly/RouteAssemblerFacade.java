package com.finexatech.esb.compiler.assembly;

import com.finexatech.esb.spec.RouteSpec;
import org.apache.camel.builder.RouteBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Facade that decides which assembler to use:
 * - spec has process or routing → ComplexRouteAssembler
 * - otherwise                   → RouteAssembler (immutable, Phase-1 behaviour)
 *
 * Inject this class wherever RouteAssembler was injected.
 * Delegates adapter registry queries to the simple assembler.
 */
@Component
public class RouteAssemblerFacade {

    private static final Logger log = LoggerFactory.getLogger(RouteAssemblerFacade.class);

    private final RouteAssembler        simpleAssembler;
    private final ComplexRouteAssembler complexAssembler;

    @Autowired
    public RouteAssemblerFacade(RouteAssembler simpleAssembler,
                                ComplexRouteAssembler complexAssembler) {
        this.simpleAssembler  = simpleAssembler;
        this.complexAssembler = complexAssembler;
    }

    public RouteBuilder assemble(RouteSpec spec) {
        boolean isComplex = spec.getProcess() != null || spec.getRouting() != null;
        log.debug("Assembling route '{}' via {} assembler",
                spec.routeName(), isComplex ? "complex" : "simple");
        return isComplex
                ? complexAssembler.assemble(spec)
                : simpleAssembler.assemble(spec);
    }

    public Map<String, SourceAdapter>    registeredSources()    { return simpleAssembler.registeredSources(); }
    public Map<String, TargetAdapter>    registeredTargets()    { return simpleAssembler.registeredTargets(); }
    public Map<String, TransformAdapter> registeredTransforms() { return simpleAssembler.registeredTransforms(); }
}
