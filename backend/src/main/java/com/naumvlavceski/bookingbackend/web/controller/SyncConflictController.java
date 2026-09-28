package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.dto.SyncConflictResponse;
import com.naumvlavceski.bookingbackend.service.SyncConflictService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/conflicts")
@RequiredArgsConstructor
public class SyncConflictController {
    private final SyncConflictService syncConflictService;

    @GetMapping
    public List<SyncConflictResponse> listOpen(@CurrentUserId UUID ownerId) {
        return syncConflictService.listOpen(ownerId);
    }

    @PostMapping("/{id}/dismiss")
    public ResponseEntity<Void> dismiss(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        syncConflictService.dismiss(ownerId, id);
        return ResponseEntity.noContent().build();
    }
}
