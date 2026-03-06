package com.finexatech.esb.compiler.assembly;

import com.finexatech.esb.spec.*;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.model.ChoiceDefinition;
import org.apache.camel.model.ProcessorDefinition;
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
 * Assembles Camel routes that use Phase-2 EIP patterns:
 * process steps (set-header, log, script, route-to, split, wire-tap)
 * and content-based routing.
 *
 * Invoked by RouteAssemblerFacade when the spec has a process or routing block.
 * All adapter registries are shared with RouteAssembler via Spring injection.
 */
@Component
public class ComplexRouteAssembler {

    private static final Logger log = LoggerFactory.getLogger(ComplexRouteAssembler.class);

    private final Map<String, SourceAdapter>    sourceAdapters;
    private final Map<String, TargetAdapter>    targetAdapters;
    private final Map<String, TransformAdapter> transformAdapters;
    private final List<RouteInterceptor>        interceptors;
    private final Map<String, StepApplier>      stepRegistry;

    @Autowired
    public ComplexRouteAssembler(
            List<SourceAdapter>    sources,
            List<TargetAdapter>    targets,
            List<TransformAdapter> transforms,
            List<RouteInterceptor> interceptors,
            List<StepApplier>      stepAppliers) {

        this.sourceAdapters    = index(sources,      SourceAdapter::protocol);
        this.targetAdapters    = index(targets,       TargetAdapter::protocol);
        this.transformAdapters = index(transforms,    TransformAdapter::type);
        this.stepRegistry      = index(stepAppliers,  StepApplier::stepType);
        this.interceptors      = interceptors.stream()
                .sorted(Comparator.comparingInt(RouteInterceptor::order))
                .collect(Collectors.toList());

        log.info("ComplexRouteAssembler ready — steps={}", stepRegistry.keySet());
    }

    public RouteBuilder assemble(RouteSpec spec) {
        log.info("Assembling complex route: {}", spec.routeName());

        SourceAdapter src = resolve(sourceAdapters, spec.getSource().getType(), "source");

        return new RouteBuilder() {
            @Override
            public void configure() {
                interceptors.forEach(i -> i.apply(this, spec));

                RouteDefinition route = from(src.buildFromUri(spec.getSource()))
                        .routeId(spec.routeName());

                // 1 — apply process steps (before routing)
                if (spec.getProcess() != null) {
                    for (StepSpec step : spec.getProcess().getSteps()) {
                        StepApplier applier = stepRegistry.get(step.getType());
                        if (applier == null) {
                            throw new IllegalArgumentException(
                                    "Unknown step type: " + step.getType() +
                                    ". Available: " + stepRegistry.keySet());
                        }
                        applier.apply(route, step);
                    }
                }

                // 2 — apply routing OR direct target
                if (spec.getRouting() != null) {
                    applyRouting(route, spec.getRouting());
                } else if (spec.getTarget() != null) {
                    // Process steps present but no routing — wire directly to target
                    applyTarget(route, spec);
                }

                src.configure(route, spec.getSource());

                log.info("Complex route assembled: {} — from={}",
                        spec.routeName(), src.buildFromUri(spec.getSource()));
            }

            // ── content-based router ────────────────────────────────────────

            private void applyRouting(RouteDefinition route, RoutingSpec routing) {
                if (!"content-based".equals(routing.getType())) {
                    throw new IllegalArgumentException(
                            "Unsupported routing type: " + routing.getType());
                }

                ChoiceDefinition choice = route.choice();

                RoutingRule defaultRule = null;
                for (RoutingRule rule : routing.getRules()) {
                    if (rule.isDefault()) {
                        defaultRule = rule;
                        continue;
                    }
                    // In Camel 4, when()/otherwise() return ChoiceDefinition for fluent chaining
                    choice.when(EsbExpressionHelper.buildPredicate(rule.getCondition()));
                    applyRuleSteps(choice, rule.getSteps());
                    applyRuleTarget(choice, rule.getTarget());
                }

                if (defaultRule == null) {
                    throw new IllegalArgumentException(
                            "content-based routing requires exactly one rule with default: true");
                }

                choice.otherwise();
                applyRuleSteps(choice, defaultRule.getSteps());
                applyRuleTarget(choice, defaultRule.getTarget());

                choice.endChoice();
            }

            private void applyRuleSteps(ProcessorDefinition<?> def, List<StepSpec> steps) {
                if (steps == null) return;
                for (StepSpec s : steps) {
                    StepApplier applier = stepRegistry.get(s.getType());
                    if (applier == null) {
                        throw new IllegalArgumentException("Unknown step type in rule: " + s.getType());
                    }
                    applier.apply(def, s);
                }
            }

            private void applyRuleTarget(ProcessorDefinition<?> def, TargetSpec targetSpec) {
                if (targetSpec == null) return;
                TargetAdapter tgt = resolve(targetAdapters, targetSpec.getType(), "target");
                def.process(tgt.preProcessor(targetSpec))
                   .to(tgt.buildToUri(targetSpec))
                   .process(tgt.postProcessor(targetSpec));
            }

            // ── simple target (process steps + no routing) ─────────────────

            private void applyTarget(RouteDefinition route, RouteSpec spec) {
                TargetAdapter    tgt   = resolve(targetAdapters, spec.getTarget().getType(), "target");
                TransformAdapter reqTx = resolve(transformAdapters, spec.getTransform().getRequest().getType(), "transform");
                TransformAdapter resTx = resolve(transformAdapters, spec.getTransform().getResponse().getType(), "transform");

                route.process(reqTx.buildProcessor(spec.getTransform().getRequest()))
                     .process(tgt.preProcessor(spec.getTarget()))
                     .to(tgt.buildToUri(spec.getTarget()))
                     .process(tgt.postProcessor(spec.getTarget()))
                     .process(resTx.buildProcessor(spec.getTransform().getResponse()));
            }
        };
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private <T> T resolve(Map<String, T> registry, String type, String role) {
        T adapter = registry.get(type);
        if (adapter == null) {
            throw new IllegalArgumentException(
                    "No %s adapter registered for type '%s'. Available: %s"
                            .formatted(role, type, registry.keySet()));
        }
        return adapter;
    }

    private <T> Map<String, T> index(List<T> list, Function<T, String> keyFn) {
        return list.stream().collect(Collectors.toMap(keyFn, Function.identity(),
                (a, b) -> { log.warn("Duplicate adapter key — keeping first: {}", a); return a; }));
    }
}
