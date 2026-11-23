package com.naumvlavceski.bookingbackend.admin;

import com.naumvlavceski.bookingbackend.admin.AdminAccessFilter.AdminContext;
import com.naumvlavceski.bookingbackend.admin.AdminDtos.*;
import io.swagger.v3.oas.annotations.Hidden;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * The admin panel's API (all under /api/admin, behind AdminAccessFilter). Read-only, except the admin's own notes.
 * Every call is audited with ids and counts only, except the polled badge and session calls. Search terms are never
 * logged or audited.
 */
@Hidden
@RestController
@RequestMapping(AdminAccessFilter.PREFIX)
public class AdminController {
    private final AdminQueryService queries;
    private final AdminNoteService notes;
    private final SystemStatusService system;
    private final AdminAuditService audit;

    public AdminController(AdminQueryService queries, AdminNoteService notes, SystemStatusService system,
                           AdminAuditService audit) {
        this.queries = queries;
        this.notes = notes;
        this.system = system;
        this.audit = audit;
    }

    private void record(HttpServletRequest request, String action, UUID target, Map<String, ?> details) {
        audit.record(AdminAuthController.context(request).userId(), action, target, details, request);
    }

    @GetMapping("/overview")
    public Overview overview(HttpServletRequest request) {
        Overview o = queries.overview(notes.due(10));
        record(request, AdminAuditService.OVERVIEW_VIEWED, null, null);
        return o;
    }

    /** Polled for the Owners badge: not audited. */
    @GetMapping("/badge")
    public Map<String, Long> badge() {
        return Map.of("needHelp", queries.needHelpCount());
    }

    @GetMapping("/owners")
    public OwnerPage owners(@RequestParam(required = false) String query,
                            @RequestParam(defaultValue = "attention") String filter,
                            @RequestParam(required = false) String sort,
                            @RequestParam(defaultValue = "0") int page,
                            @RequestParam(defaultValue = "" + AdminQueryService.DEFAULT_SIZE) int size,
                            HttpServletRequest request) {
        AdminQueryService.Filter f = switch (filter.toLowerCase(Locale.ROOT)) {
            case "attention" -> AdminQueryService.Filter.ATTENTION;
            case "all" -> AdminQueryService.Filter.ALL;
            case "inactive14" -> AdminQueryService.Filter.INACTIVE14;
            default -> throw new IllegalArgumentException("filter must be attention, all or inactive14");
        };
        AdminQueryService.Sort s = sort == null || sort.isBlank() ? null : switch (sort.toLowerCase(Locale.ROOT)) {
            case "urgency" -> AdminQueryService.Sort.URGENCY;
            case "lastseen", "last_seen" -> AdminQueryService.Sort.LAST_SEEN;
            case "registered" -> AdminQueryService.Sort.REGISTERED;
            default -> throw new IllegalArgumentException("sort must be urgency, lastSeen or registered");
        };
        OwnerPage result = queries.owners(query, f, s, page, size);
        // Never the search term, only how many rows came back
        record(request, AdminAuditService.OWNERS_LISTED, null, Map.of("results", result.items().size()));
        return result;
    }

    @GetMapping("/owners/{id}")
    public OwnerDetail owner(@PathVariable UUID id, HttpServletRequest request) {
        OwnerDetail d = queries.owner(id);
        record(request, AdminAuditService.OWNER_VIEWED, id, null);
        return d;
    }

    @GetMapping("/owners/{id}/reservations")
    public ReservationPage reservations(@PathVariable UUID id, @RequestParam(defaultValue = "changed") String sort,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "" + AdminQueryService.DEFAULT_SIZE) int size,
                                        HttpServletRequest request) {
        ReservationPage r = queries.reservations(id, sort, page, size);
        record(request, AdminAuditService.RESERVATIONS_VIEWED, id, Map.of("results", r.items().size()));
        return r;
    }

    @GetMapping("/owners/{id}/calendars")
    public List<UnitCalendars> calendars(@PathVariable UUID id, HttpServletRequest request) {
        List<UnitCalendars> c = queries.calendars(id);
        record(request, AdminAuditService.CALENDARS_VIEWED, id, Map.of("units", c.size()));
        return c;
    }

    @GetMapping("/owners/{id}/emails")
    public EmailPage emails(@PathVariable UUID id, @RequestParam(defaultValue = "0") int page,
                            @RequestParam(defaultValue = "" + AdminQueryService.DEFAULT_SIZE) int size,
                            HttpServletRequest request) {
        EmailPage e = queries.emails(id, page, size);
        record(request, AdminAuditService.EMAILS_VIEWED, id, Map.of("results", e.items().size()));
        return e;
    }

    /** The stored text of an email the admin wrote (ADMIN_MESSAGE only). */
    @GetMapping("/owners/{id}/emails/{emailId}")
    public EmailBody emailBody(@PathVariable UUID id, @PathVariable UUID emailId, HttpServletRequest request) {
        EmailBody b = queries.emailBody(id, emailId);
        record(request, AdminAuditService.EMAIL_BODY_VIEWED, id, Map.of("emailLog", emailId));
        return b;
    }

    // ---------- notes ----------

    public record NoteRequest(String text, LocalDate remindOn, Boolean done) {}

    @GetMapping("/owners/{id}/notes")
    public List<Note> notes(@PathVariable UUID id, HttpServletRequest request) {
        queries.ownerIdOf(id);
        List<Note> list = notes.list(id);
        record(request, AdminAuditService.NOTES_VIEWED, id, Map.of("results", list.size()));
        return list;
    }

    @PostMapping("/owners/{id}/notes")
    public ResponseEntity<Note> createNote(@PathVariable UUID id, @RequestBody NoteRequest body, HttpServletRequest request) {
        queries.ownerIdOf(id);
        AdminContext ctx = AdminAuthController.context(request);
        Note n = notes.create(id, ctx.userId(), body.text(), body.remindOn());
        record(request, AdminAuditService.NOTE_CREATED, id, Map.of("note", n.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(n);
    }

    @PatchMapping("/notes/{noteId}")
    public Note updateNote(@PathVariable UUID noteId, @RequestBody NoteRequest body, HttpServletRequest request) {
        Note n = notes.update(noteId, body.text(), body.remindOn(), Boolean.TRUE.equals(body.done()));
        record(request, AdminAuditService.NOTE_UPDATED, n.ownerId(), Map.of("note", n.id()));
        return n;
    }

    @DeleteMapping("/notes/{noteId}")
    public ResponseEntity<Void> deleteNote(@PathVariable UUID noteId, HttpServletRequest request) {
        Note n = notes.delete(noteId);
        record(request, AdminAuditService.NOTE_DELETED, n.ownerId(), Map.of("note", n.id()));
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/follow-ups")
    public List<Reminder> followUps(HttpServletRequest request) {
        List<Reminder> due = notes.due(AdminQueryService.MAX_SIZE);
        record(request, AdminAuditService.FOLLOW_UPS_VIEWED, null, Map.of("results", due.size()));
        return due;
    }

    // ---------- audit log and system ----------

    @GetMapping("/audit-log")
    public AuditPage auditLog(@RequestParam(defaultValue = "0") int page,
                              @RequestParam(defaultValue = "" + AdminQueryService.DEFAULT_SIZE) int size,
                              HttpServletRequest request) {
        AuditPage a = queries.audit(page, size);
        record(request, AdminAuditService.AUDIT_LOG_VIEWED, null, Map.of("page", page));
        return a;
    }

    @GetMapping("/system")
    public SystemStatus system(HttpServletRequest request) {
        SystemStatus s = system.status();
        record(request, AdminAuditService.SYSTEM_VIEWED, null, null);
        return s;
    }
}
