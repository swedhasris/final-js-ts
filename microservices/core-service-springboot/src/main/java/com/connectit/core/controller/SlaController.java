package com.connectit.core.controller;

import com.connectit.core.model.*;
import com.connectit.core.service.UserService;
import com.connectit.core.service.SlaService;
import com.connectit.core.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class SlaController {

    private final SlaService        slaService;
    private final TicketRepository  ticketRepo;
    private final UserService       userService;

    @GetMapping("/sla/policies")
    public ResponseEntity<?> policies(@RequestHeader(value = "x-user-uid", required = false) String requesterUid) {
        ResponseEntity<?> denied = requireSlaAdmin(requesterUid);
        if (denied != null) return denied;
        return ResponseEntity.ok(slaService.getAllPolicies());
    }

    @PostMapping("/sla/policies")
    public ResponseEntity<?> createPolicy(@RequestBody SLAPolicy policy,
                                          @RequestHeader(value = "x-user-uid", required = false) String requesterUid) {
        ResponseEntity<?> denied = requireSlaAdmin(requesterUid);
        if (denied != null) return denied;
        return ResponseEntity.status(201).body(slaService.save(policy));
    }

    @PutMapping("/sla/policies/{id}")
    public ResponseEntity<?> updatePolicy(@PathVariable Long id, @RequestBody SLAPolicy policy,
                                          @RequestHeader(value = "x-user-uid", required = false) String requesterUid) {
        ResponseEntity<?> denied = requireSlaAdmin(requesterUid);
        if (denied != null) return denied;
        policy.setId(id);
        return ResponseEntity.ok(slaService.save(policy));
    }

    @DeleteMapping("/sla/policies/{id}")
    public ResponseEntity<?> deletePolicy(@PathVariable Long id,
                                          @RequestHeader(value = "x-user-uid", required = false) String requesterUid) {
        ResponseEntity<?> denied = requireSlaAdmin(requesterUid);
        if (denied != null) return denied;
        slaService.delete(id);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping({"/sla/breaches", "/sla-breaches/all"})
    public ResponseEntity<?> breaches(@RequestHeader(value = "x-user-uid", required = false) String requesterUid) {
        ResponseEntity<?> denied = requireSlaAdmin(requesterUid);
        if (denied != null) return denied;
        return ResponseEntity.ok(slaService.getBreaches());
    }

    @GetMapping("/sla-breaches/user/{userId}")
    public ResponseEntity<?> breachesByUser(@PathVariable String userId,
                                            @RequestHeader(value = "x-user-uid", required = false) String requesterUid) {
        ResponseEntity<?> denied = requireSlaAdmin(requesterUid);
        if (denied != null) return denied;
        return ResponseEntity.ok(slaService.getBreachesByUser(userId));
    }

    @GetMapping("/sla/audit/{ticketId}")
    public ResponseEntity<?> auditLogs(@PathVariable String ticketId,
                                       @RequestHeader(value = "x-user-uid", required = false) String requesterUid) {
        ResponseEntity<?> denied = requireSlaAdmin(requesterUid);
        if (denied != null) return denied;
        return ResponseEntity.ok(slaService.getSlaAuditLogs(ticketId));
    }

    @PostMapping("/tickets/trigger-escalation")
    public ResponseEntity<?> triggerEscalation(@RequestHeader(value = "x-user-uid", required = false) String requesterUid) {
        ResponseEntity<?> denied = requireSlaAdmin(requesterUid);
        if (denied != null) return denied;
        return ResponseEntity.ok(Map.of("message","Escalation triggered — check SLA scheduler logs"));
    }

    private ResponseEntity<?> requireSlaAdmin(String requesterUid) {
        if (requesterUid == null || requesterUid.isBlank()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "Unauthorized: User session not found."));
        }

        User requester = userService.findByUid(requesterUid)
            .orElse(null);
        if (requester == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "Unauthorized: Requester not found."));
        }

        String role = requester.getRole();
        boolean allowed = "admin".equals(role) || "super_admin".equals(role) || "ultra_super_admin".equals(role);
        if (!allowed) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("error", "Forbidden: You don't have permission to access SLA management."));
        }

        return null;
    }
}
