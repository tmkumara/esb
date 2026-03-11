package com.finexatech.esb.runtime.loader;

import com.finexatech.esb.compiler.loader.RouteSpecParser;
import com.finexatech.esb.compiler.validation.ValidationReport;
import com.finexatech.esb.runtime.registry.LiveRouteRegistry;
import com.finexatech.esb.spec.RouteSpec;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import java.io.FileNotFoundException;
import java.util.ArrayList;
import java.util.List;

/**
 * Scans the routes directory at startup and registers all YAML specs.
 * Reports validation errors clearly without crashing the app.
 *
 * Configure the scan location in application.yaml:
 *   esb.routes.scan-pattern: "classpath:routes/*.yaml"
 */
@Component
public class RouteSpecLoader {

    private static final Logger log = LoggerFactory.getLogger(RouteSpecLoader.class);

    @Value("${esb.routes.scan-pattern:classpath:routes/*.yaml}")
    private String scanPattern;

    private final RouteSpecParser   parser;
    private final LiveRouteRegistry registry;

    @Autowired
    public RouteSpecLoader(RouteSpecParser parser, LiveRouteRegistry registry) {
        this.parser   = parser;
        this.registry = registry;
    }

    @PostConstruct
    public void loadAll() {
        if (scanPattern == null || scanPattern.isBlank()) {
            log.info("RouteSpecLoader: scan-pattern is empty — skipping classpath route loading");
            return;
        }
        log.info("Loading route specs from: {}", scanPattern);
        List<String> failed  = new ArrayList<>();
        List<String> loaded  = new ArrayList<>();

        try {
            PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
            Resource[] resources = resolver.getResources(scanPattern);

            if (resources.length == 0) {
                log.warn("No route spec files found at: {}", scanPattern);
                return;
            }

            for (Resource resource : resources) {
                String filename = resource.getFilename();
                try {
                    RouteSpec spec = parser.parse(resource.getInputStream(), filename);
                    ValidationReport report = registry.register(spec);

                    if (report.isPassed()) {
                        loaded.add(spec.routeName());
                        log.info("✓ Route loaded: {} ({})", spec.routeName(), filename);
                    } else {
                        failed.add(spec.routeName());
                        log.error("✗ Route FAILED validation: {} — errors: {}",
                                  spec.routeName(), report.errors());
                    }
                } catch (Exception e) {
                    failed.add(filename);
                    log.error("✗ Failed to load route spec: {}", filename, e);
                }
            }

        } catch (FileNotFoundException e) {
            // Classpath routes directory doesn't exist in this JAR — normal for server deployments
            // where routes are dropped into store-dir and loaded by HotReloadWatcher instead.
            log.warn("RouteSpecLoader: classpath directory not found for pattern '{}' — " +
                     "no bundled routes in this JAR. Routes will be loaded from store-dir by HotReloadWatcher.",
                     scanPattern);
        } catch (Exception e) {
            log.error("Failed to scan route specs from: {}", scanPattern, e);
        }

        log.info("Route loading complete — loaded: {}, failed: {}", loaded, failed);
    }
}
