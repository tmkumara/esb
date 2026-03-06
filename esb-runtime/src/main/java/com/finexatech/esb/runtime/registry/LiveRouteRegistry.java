package com.finexatech.esb.runtime.registry;

import com.finexatech.esb.compiler.assembly.RouteAssemblerFacade;
import com.finexatech.esb.compiler.validation.ValidationPipeline;
import com.finexatech.esb.compiler.validation.ValidationReport;
import com.finexatech.esb.spec.RouteSpec;
import org.apache.camel.CamelContext;
import org.apache.camel.ServiceStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages all live routes in the running CamelContext.
 * Supports register, deregister, and hot-reload without restart.
 */
@Component
public class LiveRouteRegistry {

    private static final Logger log = LoggerFactory.getLogger(LiveRouteRegistry.class);

    private final CamelContext           camelContext;
    private final RouteAssemblerFacade   assembler;
    private final ValidationPipeline     validator;

    // Track live specs by route name
    private final Map<String, RouteSpec> liveSpecs = new ConcurrentHashMap<>();

    @Autowired
    public LiveRouteRegistry(CamelContext camelContext,
                              RouteAssemblerFacade assembler,
                              ValidationPipeline validator) {
        this.camelContext = camelContext;
        this.assembler    = assembler;
        this.validator    = validator;
    }

    /**
     * Validate + assemble + add route to live CamelContext.
     * Throws if validation fails or Camel rejects the route.
     */
    public ValidationReport register(RouteSpec spec) throws Exception {
        log.info("Registering route: {}", spec.routeName());

        ValidationReport report = validator.validate(spec);
        if (!report.isPassed()) {
            log.error("Route '{}' failed validation: {}", spec.routeName(), report.errors());
            return report;
        }

        // Remove existing route — check both our map AND the live CamelContext
        // (they can diverge if a previous reload partially failed)
        if (liveSpecs.containsKey(spec.routeName()) || camelContext.getRoute(spec.routeName()) != null) {
            deregister(spec.routeName());
        }

        camelContext.addRoutes(assembler.assemble(spec));
        liveSpecs.put(spec.routeName(), spec);
        log.info("Route '{}' is now LIVE", spec.routeName());
        return report;
    }

    /**
     * Stop and remove a route from the live CamelContext.
     * Guards against: route not present, already stopped, removeRoute returning false.
     */
    public void deregister(String routeName) throws Exception {
        log.info("Deregistering route: {}", routeName);

        // Only stop if the route actually exists in Camel
        if (camelContext.getRoute(routeName) != null) {
            ServiceStatus status = camelContext.getRouteController().getRouteStatus(routeName);
            if (status != null && !status.isStopped()) {
                camelContext.getRouteController().stopRoute(routeName);
            }

            boolean removed = camelContext.removeRoute(routeName);
            if (!removed) {
                throw new IllegalStateException(
                    "CamelContext refused to remove route '" + routeName +
                    "' — status=" + camelContext.getRouteController().getRouteStatus(routeName));
            }
        } else {
            log.warn("Route '{}' not found in CamelContext — skipping stop/remove", routeName);
        }

        liveSpecs.remove(routeName);
        log.info("Route '{}' deregistered", routeName);
    }

    /**
     * Hot-reload: deregister then re-register.
     * In-flight requests on the old route complete before the route stops.
     */
    public ValidationReport reload(RouteSpec spec) throws Exception {
        log.info("Hot-reloading route: {}", spec.routeName());
        return register(spec);   // register() handles deregister internally
    }

    public Collection<RouteSpec> allSpecs() {
        return Collections.unmodifiableCollection(liveSpecs.values());
    }

    public Optional<RouteSpec> getSpec(String name) {
        return Optional.ofNullable(liveSpecs.get(name));
    }

    public ServiceStatus getStatus(String routeName) {
        return camelContext.getRouteController().getRouteStatus(routeName);
    }

    public List<RouteStatusView> listStatus() {
        return liveSpecs.values().stream()
            .map(spec -> new RouteStatusView(
                spec.routeName(),
                spec.getMetadata() != null ? spec.getMetadata().getVersion() : "?",
                spec.getSource() != null ? spec.getSource().getType() : "?",
                spec.getSource() != null ? spec.getSource().getMethod() : null,
                spec.getSource() != null ? spec.getSource().getPath() : "?",
                spec.getTarget() != null ? spec.getTarget().getType() : "routing",
                String.valueOf(getStatus(spec.routeName())),
                spec.getTransform() != null ? spec.getTransform().getRequest().getType() : null,
                spec.getTransform() != null ? spec.getTransform().getResponse().getType() : null
            ))
            .toList();
    }

    public record RouteStatusView(
        String name,
        String version,
        String sourceType,
        String sourceMethod,
        String sourcePath,
        String targetType,
        String status,
        String requestTransformType,
        String responseTransformType
    ) {}
}
