package com.finexatech.esb.adapters.source;

import com.finexatech.esb.compiler.assembly.SourceAdapter;
import com.finexatech.esb.spec.SourceSpec;
import org.apache.camel.model.RouteDefinition;
import org.springframework.stereotype.Component;

/**
 * Trigger-based source — fires on a fixed schedule, no inbound HTTP port.
 *
 * Use this as the entry point for polling patterns:
 *   Timer → HTTP GET (external API) → Split → direct:process-item
 *
 * YAML:
 *   source:
 *     type: timer
 *     periodMs: 10000       # fire every 10 seconds
 *     name: my-poll-timer   # optional — used as the Camel timer name (for JMX/logs)
 *
 * The timer fires once immediately on startup, then every periodMs milliseconds.
 * Set fixedRate=true so drift doesn't accumulate over time.
 *
 * The exchange body is empty on timer fire — the route is responsible for
 * enriching it (e.g. via a route-to step that calls an external HTTP API).
 */
@Component
public class TimerSourceAdapter implements SourceAdapter {

    private static final long DEFAULT_PERIOD_MS = 5_000;

    @Override
    public String protocol() { return "timer"; }

    @Override
    public String buildFromUri(SourceSpec spec) {
        String timerName = spec.getName() != null ? spec.getName() : "esb-timer";
        long period = spec.getPeriodMs() > 0 ? spec.getPeriodMs() : DEFAULT_PERIOD_MS;
        // delay=1000  → wait 1 s before first fire (gives the app time to fully start)
        return "timer:" + timerName
                + "?period=" + period
                + "&fixedRate=true"
                + "&delay=1000";
    }

    @Override
    public void configure(RouteDefinition route, SourceSpec source) {
        // Timer routes are not HTTP-exposed — no servlet mapping needed.
        // Nothing to configure beyond the URI.
    }
}
