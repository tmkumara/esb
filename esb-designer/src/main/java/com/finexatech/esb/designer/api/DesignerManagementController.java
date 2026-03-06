package com.finexatech.esb.designer.api;

import com.finexatech.esb.compiler.assembly.RouteAssemblerFacade;
import com.finexatech.esb.compiler.loader.RouteSpecParser;
import com.finexatech.esb.compiler.validation.ValidationPipeline;
import com.finexatech.esb.compiler.validation.ValidationReport;
import com.finexatech.esb.spec.RouteSpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 * Designer management API — route authoring and validation tooling.
 * All endpoints are under /manage/** (same path prefix as runtime, proxied separately by Vite).
 *
 * Exposed endpoints:
 *   POST /manage/routes/validate  — validate YAML without deploying
 *   POST /manage/routes/save      — validate + write YAML to the runtime's watch directory
 *   GET  /manage/routes           — list YAML files in output directory
 *   GET  /manage/components       — adapters registered in this designer context
 */
@RestController
@RequestMapping("/manage")
public class DesignerManagementController {

    private static final Logger log = LoggerFactory.getLogger(DesignerManagementController.class);

    @Value("${esb.designer.routes-output-dir:${user.dir}/routes}")
    private String routesOutputDir;

    private final ValidationPipeline   pipeline;
    private final RouteSpecParser      parser;
    private final RouteAssemblerFacade assembler;

    public DesignerManagementController(ValidationPipeline pipeline,
                                         RouteSpecParser parser,
                                         RouteAssemblerFacade assembler) {
        this.pipeline = pipeline;
        this.parser   = parser;
        this.assembler = assembler;
    }

    /**
     * Validate a YAML route spec — runs full validation pipeline.
     * Does NOT deploy. Returns the ValidationReport so the UI can display layer-by-layer results.
     */
    @PostMapping(value = "/routes/validate", consumes = "text/plain")
    public ResponseEntity<ValidationReport> validate(@RequestBody String yaml) {
        try {
            RouteSpec spec = parser.parseString(yaml, "designer-validate");
            ValidationReport report = pipeline.validate(spec);
            return ResponseEntity.ok(report);
        } catch (Exception e) {
            log.error("Validation request failed", e);
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * Validate + save YAML to the configured output directory.
     * The runtime's HotReloadWatcher picks up the file automatically.
     *
     * Returns 400 with ValidationReport if validation fails.
     * Returns 200 with saved file path on success.
     */
    @PostMapping(value = "/routes/save", consumes = "text/plain")
    public ResponseEntity<?> saveRoute(@RequestBody String yaml) {
        try {
            RouteSpec spec = parser.parseString(yaml, "designer-save");
            ValidationReport report = pipeline.validate(spec);
            if (!report.isPassed()) {
                return ResponseEntity.badRequest().body(report);
            }
            Path dir = Paths.get(routesOutputDir);
            Files.createDirectories(dir);
            Path outFile = dir.resolve(spec.routeName() + ".yaml");
            Files.writeString(outFile, yaml, StandardCharsets.UTF_8);
            log.info("Route '{}' saved to {}", spec.routeName(), outFile.toAbsolutePath());
            return ResponseEntity.ok(Map.of(
                "saved", outFile.toAbsolutePath().toString(),
                "route", spec.routeName()
            ));
        } catch (Exception e) {
            log.error("Failed to save route", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * List route names saved to the output directory.
     * Used by the UI to show which routes have been persisted.
     */
    @GetMapping("/routes")
    public ResponseEntity<?> listSavedRoutes() {
        try {
            Path dir = Paths.get(routesOutputDir);
            if (!Files.exists(dir)) {
                return ResponseEntity.ok(List.of());
            }
            List<String> routes = Files.list(dir)
                .filter(p -> {
                    String name = p.getFileName().toString();
                    return name.endsWith(".yaml") || name.endsWith(".yml");
                })
                .map(p -> p.getFileName().toString().replaceAll("\\.(yaml|yml)$", ""))
                .sorted()
                .toList();
            return ResponseEntity.ok(routes);
        } catch (Exception e) {
            log.error("Failed to list saved routes", e);
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }

    /**
     * List all adapter types registered in the designer's CamelContext.
     * The UI palette fetches this to know which source/target/transform types are available.
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
