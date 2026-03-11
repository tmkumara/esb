package com.finexatech.esb.runtime.api;

import com.finexatech.esb.adapters.audit.AuditEvent;
import com.finexatech.esb.adapters.audit.AuditStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Exposes the audit log for UI monitoring and ops tooling.
 *
 * GET /manage/audit?limit=50  →  list of AuditEvents, newest first
 */
@RestController
@RequestMapping("/manage/audit")
public class AuditController {

    @Autowired
    private AuditStore auditStore;

    @GetMapping
    public List<AuditEvent> getAuditLog(
            @RequestParam(name = "limit", defaultValue = "50") int limit) {
        return auditStore.recent(limit);
    }
}
