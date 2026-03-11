package com.finexatech.esb.adapters.audit;

/**
 * Immutable record of a single message processed by the ESB.
 * Stored in AuditStore and exposed via /manage/audit.
 */
public record AuditEvent(
    String id,            // UUID
    String routeName,
    String correlationId,
    String method,        // GET / POST / etc.
    String path,          // e.g. /api/v1/accounts/ACC001/balance
    String sourceIp,
    int    statusCode,
    long   durationMs,
    String timestamp      // ISO-8601
) {}
