package com.finexatech.esb.runtime.api;

import com.finexatech.esb.compiler.assembly.RouteAssemblerFacade;
import com.finexatech.esb.compiler.loader.RouteSpecParser;
import com.finexatech.esb.compiler.validation.ValidationReport;
import com.finexatech.esb.runtime.registry.LiveRouteRegistry;
import com.finexatech.esb.spec.RouteSpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;

/**
 * Management REST API for the ESB.
 * All management endpoints are under /manage/** (separate from business routes).
 */
@RestController
@RequestMapping("/manage")
public class RouteManagementController {

    private static final Logger log = LoggerFactory.getLogger(RouteManagementController.class);

    @Value("${esb.routes.store-dir:${user.home}/.esb/routes}")
    private String storeDir;

    private final LiveRouteRegistry    registry;
    private final RouteSpecParser      parser;
    private final RouteAssemblerFacade assembler;

    @Autowired
    public RouteManagementController(LiveRouteRegistry registry,
                                      RouteSpecParser parser,
                                      RouteAssemblerFacade assembler) {
        this.registry  = registry;
        this.parser    = parser;
        this.assembler = assembler;
    }

    /** List all live routes with their status */
    @GetMapping("/routes")
    public List<LiveRouteRegistry.RouteStatusView> listRoutes() {
        return registry.listStatus();
    }

    /** Get full RouteSpec detail for one route */
    @GetMapping("/routes/{name}")
    public ResponseEntity<RouteSpec> getRoute(@PathVariable("name") String name) {
        return registry.getSpec(name)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    /**
     * Deploy a new route from YAML spec.
     * Body: raw YAML string of the RouteSpec.
     */
    @PostMapping("/routes")
    public ResponseEntity<ValidationReport> deploy(@RequestBody String yaml) {
        try {
            RouteSpec spec   = parser.parseString(yaml, "api-request");
            ValidationReport report = registry.register(spec);

            if (report.isPassed()) {
                return ResponseEntity.ok(report);
            } else {
                return ResponseEntity.unprocessableEntity().body(report);
            }
        } catch (Exception e) {
            log.error("Route deploy failed", e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /** Hot-reload a specific route by name (re-reads from original file) */
    @PutMapping("/routes/{name}/reload")
    public ResponseEntity<Map<String, String>> reload(@PathVariable("name") String name) {
        return registry.getSpec(name)
            .map(spec -> {
                try {
                    registry.reload(spec);
                    return ResponseEntity.ok(Map.of(
                        "status", "reloaded",
                        "route", name
                    ));
                } catch (Exception e) {
                    log.error("Failed to reload route: {}", name, e);
                    return ResponseEntity.internalServerError()
                        .<Map<String, String>>build();
                }
            })
            .orElse(ResponseEntity.notFound().build());
    }

    /** Suspend (pause) a live route — keeps it in registry, stops new messages */
    @PostMapping("/routes/{name}/stop")
    public ResponseEntity<Map<String, String>> stopRoute(@PathVariable("name") String name) {
        if (registry.getSpec(name).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        try {
            registry.suspend(name);
            return ResponseEntity.ok(Map.of("route", name, "status", "Suspended"));
        } catch (Exception e) {
            log.error("Failed to suspend route: {}", name, e);
            return ResponseEntity.internalServerError()
                .<Map<String, String>>body(Map.of("error", e.getMessage()));
        }
    }

    /** Resume a suspended route */
    @PostMapping("/routes/{name}/start")
    public ResponseEntity<Map<String, String>> startRoute(@PathVariable("name") String name) {
        if (registry.getSpec(name).isEmpty()) {
            return ResponseEntity.notFound().build();
        }
        try {
            registry.resume(name);
            return ResponseEntity.ok(Map.of("route", name, "status", "Started"));
        } catch (Exception e) {
            log.error("Failed to resume route: {}", name, e);
            return ResponseEntity.internalServerError()
                .<Map<String, String>>body(Map.of("error", e.getMessage()));
        }
    }

    /** Stop and remove a route */
    @DeleteMapping("/routes/{name}")
    public ResponseEntity<Map<String, String>> deregister(@PathVariable("name") String name) {
        try {
            registry.deregister(name);
            return ResponseEntity.ok(Map.of("status", "deregistered", "route", name));
        } catch (Exception e) {
            log.error("Failed to deregister route: {}", name, e);
            return ResponseEntity.internalServerError().build();
        }
    }

    /**
     * Save a route YAML to the hot-reload watch directory so it survives restarts.
     * The HotReloadWatcher picks up the file automatically (ENTRY_CREATE / ENTRY_MODIFY).
     *
     * POST /manage/routes/{name}/persist   body: raw YAML
     */
    @PostMapping(value = "/routes/{name}/persist", consumes = "text/plain")
    public ResponseEntity<Map<String, String>> persistRoute(
            @PathVariable("name") String name,
            @RequestBody String yaml) {
        try {
            Path dir  = Paths.get(storeDir);
            Files.createDirectories(dir);
            Path file = dir.resolve(name + ".yaml");
            Files.writeString(file, yaml, StandardCharsets.UTF_8);
            log.info("Route persisted to disk: {}", file.toAbsolutePath());
            return ResponseEntity.ok(Map.of(
                "status", "saved",
                "path",   file.toAbsolutePath().toString()
            ));
        } catch (Exception e) {
            log.error("Failed to persist route '{}': {}", name, e.getMessage());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", e.getMessage()));
        }
    }

    /** Health summary */
    @GetMapping("/health")
    public Map<String, Object> health() {
        List<LiveRouteRegistry.RouteStatusView> routes = registry.listStatus();
        long active = routes.stream().filter(r -> "Started".equals(r.status())).count();
        return Map.of(
            "status", active == routes.size() ? "UP" : "DEGRADED",
            "totalRoutes", routes.size(),
            "activeRoutes", active,
            "routes", routes
        );
    }

    /**
     * List all adapter types registered in the RouteAssembler.
     * The UI builder palette fetches this at startup to know which components to show.
     * Adding a new adapter + restarting the server is all that's needed for it to appear in the UI.
     */
    @GetMapping("/components")
    public Map<String, Object> registeredComponents() {
        return Map.of(
            "sources",    assembler.registeredSources().keySet(),
            "targets",    assembler.registeredTargets().keySet(),
            "transforms", assembler.registeredTransforms().keySet()
        );
    }
}
