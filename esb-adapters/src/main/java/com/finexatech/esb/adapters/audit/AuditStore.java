package com.finexatech.esb.adapters.audit;

import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;

/**
 * In-memory audit log — keeps the 500 most-recent events (newest first).
 * Thread-safe singleton shared by AuditInterceptor (writer) and AuditController (reader).
 */
@Component
public class AuditStore {

    private static final int MAX_SIZE = 500;

    private final ConcurrentLinkedDeque<AuditEvent> events = new ConcurrentLinkedDeque<>();

    public void record(AuditEvent event) {
        events.addFirst(event);
        // Trim tail to keep memory bounded
        while (events.size() > MAX_SIZE) {
            events.pollLast();
        }
    }

    public List<AuditEvent> recent(int limit) {
        return events.stream().limit(Math.max(1, limit)).toList();
    }
}
