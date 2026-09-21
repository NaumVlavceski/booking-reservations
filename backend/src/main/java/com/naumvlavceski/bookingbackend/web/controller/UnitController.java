package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.dto.UnitRequest;
import com.naumvlavceski.bookingbackend.dto.UnitResponse;
import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.service.UnitService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class UnitController {

    private final UnitService unitService;

    @GetMapping("/api/units")
    public List<UnitResponse> listAllForOwner(@CurrentUserId UUID ownerId) {
        return unitService.findAllByOwner(ownerId);
    }

    @GetMapping("/api/properties/{propertyId}/units")
    public List<UnitResponse> listForProperty(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID propertyId
    ) {
        return unitService.findAllUnitsFromPropertyAndOwner(ownerId, propertyId);
    }

    @PostMapping("/api/properties/{propertyId}/units")
    public ResponseEntity<UnitResponse> create(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID propertyId,
            @Valid @RequestBody UnitRequest request
    ) {
        return ResponseEntity.ok(unitService.create(ownerId, propertyId, request));
    }

    @PutMapping("/api/units/{unitId}")
    public UnitResponse update(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID unitId,
            @Valid @RequestBody UnitRequest request
    ) {
        return unitService.update(ownerId, unitId, request);
    }

    @DeleteMapping("/api/units/{unitId}")
    public ResponseEntity<Void> delete(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID unitId
    ) {
        unitService.delete(ownerId, unitId);
        return ResponseEntity.noContent().build();
    }
}