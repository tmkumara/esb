package com.finexatech.esb.runtime.init;

import com.finexatech.esb.runtime.registry.LiveRouteRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Prints a structured startup summary when the runtime is started in 'init' profile.
 *
 * Fires after all routes are loaded (ApplicationReadyEvent) so the route table
 * reflects the actual live state, not a pre-load snapshot.
 *
 * Active only with -Dspring.profiles.active=init
 */
@Component
@Profile("init")
public class InitRuntimeBanner {

    private static final Logger log = LoggerFactory.getLogger(InitRuntimeBanner.class);

    @Value("${esb.routes.store-dir:routes/dev}")
    private String storeDir;

    @Value("${server.port:9090}")
    private int port;

    private final LiveRouteRegistry registry;

    public InitRuntimeBanner(LiveRouteRegistry registry) {
        this.registry = registry;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        List<LiveRouteRegistry.RouteStatusView> routes = registry.listStatus();

        log.info("");
        log.info("╔══════════════════════════════════════════════════════════════╗");
        log.info("║          ESB RUNTIME  —  INIT MODE  (Phase-2 ready)         ║");
        log.info("╠══════════════════════════════════════════════════════════════╣");
        log.info("║  Port  : {}                                               ║", port);
        log.info("║  Dev store-dir : {}                          ║", padRight(storeDir, 36));
        log.info("╠══════════════════════════════════════════════════════════════╣");
        log.info("║  PRE-LOADED ROUTES ({})                                    ║", padRight(String.valueOf(routes.size()), 2));
        log.info("╠═══════════════════════════════╦═══════════╦════════════════╣");
        log.info("║  Route Name                   ║  Method   ║  Status        ║");
        log.info("╠═══════════════════════════════╬═══════════╬════════════════╣");

        if (routes.isEmpty()) {
            log.info("║  (no routes loaded)           ║           ║                ║");
        } else {
            for (LiveRouteRegistry.RouteStatusView r : routes) {
                String method = r.sourceMethod() != null ? r.sourceMethod() : "-";
                log.info("║  {}║  {}║  {}║",
                        padRight(r.name(), 29),
                        padRight(method, 9),
                        padRight(r.status(), 14));
            }
        }

        log.info("╠═══════════════════════════════╩═══════════╩════════════════╣");
        log.info("║  NEXT: drop Phase-2 YAML files into the dev store-dir      ║");
        log.info("║        or use the Designer UI → Save to Disk               ║");
        log.info("║        HotReloadWatcher will deploy them within 300ms      ║");
        log.info("╚══════════════════════════════════════════════════════════════╝");
        log.info("");
        log.info("  Health : http://localhost:{}/manage/health", port);
        log.info("  Routes : http://localhost:{}/manage/routes", port);
        log.info("  UI     : http://localhost:3000  (npm run dev:designer)");
        log.info("");
    }

    private String padRight(String s, int len) {
        if (s == null) s = "";
        if (s.length() >= len) return s.substring(0, len);
        return s + " ".repeat(len - s.length());
    }
}
