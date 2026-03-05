package com.finexatech.esb.runtime.loader;

import com.finexatech.esb.compiler.loader.RouteSpecParser;
import com.finexatech.esb.compiler.validation.ValidationReport;
import com.finexatech.esb.runtime.registry.LiveRouteRegistry;
import com.finexatech.esb.spec.RouteSpec;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Watches an external directory for RouteSpec YAML files.
 *
 * - New file dropped  → parsed + registered automatically
 * - File modified     → hot-reloaded
 * - File deleted      → route deregistered
 *
 * Configure the watch directory in application.yaml:
 *   esb.routes.store-dir: ${user.home}/.esb/routes
 *
 * Override per broker at startup:
 *   -Desb.routes.store-dir=/opt/esb/broker-a/routes
 *
 * This is how you deploy routes without restarting the server —
 * just drop a YAML file into the watch directory.
 */
@Component
public class HotReloadWatcher {

    private static final Logger log = LoggerFactory.getLogger(HotReloadWatcher.class);

    @Value("${esb.routes.store-dir:${user.home}/.esb/routes}")
    private String watchDirPath;

    private final RouteSpecParser   parser;
    private final LiveRouteRegistry registry;

    private Path watchDir;
    private WatchService watchService;
    private ScheduledExecutorService executor;

    public HotReloadWatcher(RouteSpecParser parser, LiveRouteRegistry registry) {
        this.parser   = parser;
        this.registry = registry;
    }

    @PostConstruct
    public void start() throws IOException {
        watchDir = Paths.get(watchDirPath);

        // Create directory if it doesn't exist
        Files.createDirectories(watchDir);
        log.info("HotReloadWatcher: watching directory → {}", watchDir.toAbsolutePath());

        // Load any YAML files already present in the watch directory
        loadExistingFiles();

        // Start watching for changes
        watchService = FileSystems.getDefault().newWatchService();
        watchDir.register(watchService,
            StandardWatchEventKinds.ENTRY_CREATE,
            StandardWatchEventKinds.ENTRY_MODIFY,
            StandardWatchEventKinds.ENTRY_DELETE
        );

        executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "esb-hot-reload-watcher");
            t.setDaemon(true);
            return t;
        });
        executor.submit(this::watchLoop);

        log.info("HotReloadWatcher: started — drop .yaml files into {} to deploy routes live", watchDir);
    }

    @PreDestroy
    public void stop() {
        if (executor != null) executor.shutdownNow();
        if (watchService != null) {
            try { watchService.close(); } catch (IOException ignored) {}
        }
        log.info("HotReloadWatcher: stopped");
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /** Load all .yaml files already sitting in the watch directory at startup */
    private void loadExistingFiles() {
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(watchDir, "*.{yaml,yml}")) {
            for (Path file : stream) {
                loadFile(file, "startup-scan");
            }
        } catch (IOException e) {
            log.warn("HotReloadWatcher: could not scan existing files in {}: {}", watchDir, e.getMessage());
        }
    }

    /** Main watch loop — blocks on watchService.take() waiting for file events */
    private void watchLoop() {
        log.debug("HotReloadWatcher: watch loop started");
        while (!Thread.currentThread().isInterrupted()) {
            WatchKey key;
            try {
                key = watchService.take();   // blocks until an event arrives
            } catch (InterruptedException | ClosedWatchServiceException e) {
                log.debug("HotReloadWatcher: watch loop interrupted, stopping");
                break;
            }

            // Small delay so the file is fully written before we read it
            try { TimeUnit.MILLISECONDS.sleep(300); } catch (InterruptedException e) { break; }

            for (WatchEvent<?> event : key.pollEvents()) {
                WatchEvent.Kind<?> kind = event.kind();

                if (kind == StandardWatchEventKinds.OVERFLOW) continue;

                @SuppressWarnings("unchecked")
                Path filename = ((WatchEvent<Path>) event).context();
                Path fullPath = watchDir.resolve(filename);
                String name   = filename.toString();

                if (!name.endsWith(".yaml") && !name.endsWith(".yml")) continue;

                if (kind == StandardWatchEventKinds.ENTRY_CREATE) {
                    log.info("HotReloadWatcher: new file detected → {}", name);
                    loadFile(fullPath, "file-create");

                } else if (kind == StandardWatchEventKinds.ENTRY_MODIFY) {
                    log.info("HotReloadWatcher: file modified → {}", name);
                    loadFile(fullPath, "file-modify");

                } else if (kind == StandardWatchEventKinds.ENTRY_DELETE) {
                    log.info("HotReloadWatcher: file deleted → {}", name);
                    unloadFile(name);
                }
            }

            boolean valid = key.reset();
            if (!valid) {
                log.warn("HotReloadWatcher: watch key invalidated — directory may have been deleted");
                break;
            }
        }
    }

    /** Parse a YAML file and register the route */
    private void loadFile(Path file, String trigger) {
        try {
            RouteSpec spec = parser.parse(Files.newInputStream(file), file.getFileName().toString());
            ValidationReport report = registry.register(spec);

            if (report.isPassed()) {
                log.info("HotReloadWatcher [{}]: ✓ route '{}' loaded from {}",
                         trigger, spec.routeName(), file.getFileName());
            } else {
                log.error("HotReloadWatcher [{}]: ✗ route '{}' failed validation — errors: {}",
                          trigger, spec.routeName(), report.errors());
            }
        } catch (Exception e) {
            log.error("HotReloadWatcher [{}]: ✗ failed to load file '{}': {}",
                      trigger, file.getFileName(), e.getMessage(), e);
        }
    }

    /** Deregister route whose YAML file was deleted */
    private void unloadFile(String filename) {
        // Route name = filename without extension (e.g. "customer-lookup.yaml" → "customer-lookup")
        String routeName = filename.replaceAll("\\.(yaml|yml)$", "");
        try {
            registry.deregister(routeName);
            log.info("HotReloadWatcher: ✓ route '{}' deregistered (file deleted)", routeName);
        } catch (Exception e) {
            log.warn("HotReloadWatcher: could not deregister '{}': {}", routeName, e.getMessage());
        }
    }
}
