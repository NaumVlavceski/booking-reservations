package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.OpenApiConfig;
import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.dto.SyncConflictResponse;
import com.naumvlavceski.bookingbackend.service.SyncConflictService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/conflicts")
@RequiredArgsConstructor
@Tag(name = OpenApiConfig.TAG_CALENDAR_SYNC)
public class SyncConflictController {
    private final SyncConflictService syncConflictService;

    @Operation(summary = "Open booking conflicts",
            description = "A conflict is a Booking.com booking that the import did not save because it overlaps a "
                    + "live booking of the unit (NEW_OVERLAP), or a date change to an imported booking that would "
                    + "overlap one (CHANGE_OVERLAP). The existing booking is never changed; the owner decides. "
                    + "A conflict closes by itself when the incoming booking disappears or no longer overlaps.")
    @GetMapping
    public List<SyncConflictResponse> listOpen(@CurrentUserId UUID ownerId) {
        return syncConflictService.listOpen(ownerId);
    }

    @Operation(summary = "Dismiss a conflict",
            description = "Hides it. The same collision (same dates) is not reported again; a changed one is.")
    @ApiResponse(responseCode = "204", description = "Dismissed")
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @PostMapping("/{id}/dismiss")
    public ResponseEntity<Void> dismiss(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        syncConflictService.dismiss(ownerId, id);
        return ResponseEntity.noContent().build();
    }
}
