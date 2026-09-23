package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.dto.ReservationRequest;
import com.naumvlavceski.bookingbackend.dto.ReservationResponse;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import com.naumvlavceski.bookingbackend.service.ReservationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/reservations")
@RequiredArgsConstructor
public class ReservationController {
    private final ReservationService reservationService;

    @GetMapping
    public List<ReservationResponse> list(
            @CurrentUserId UUID ownerId,
            @RequestParam(required = false) UUID unitId,
            @RequestParam(required = false) ReservationStatus status
    ) {
        return reservationService.findAllForOwner(ownerId, unitId, status);
    }

    @GetMapping("/{id}")
    public ReservationResponse getOne(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        return reservationService.findOneForOwner(ownerId, id);
    }

    @PostMapping
    public ResponseEntity<ReservationResponse> create(
            @CurrentUserId UUID ownerId,
            @Valid @RequestBody ReservationRequest request
    ) {
        return ResponseEntity.ok(reservationService.create(ownerId, request));
    }
    @PutMapping("/{id}")
    public ResponseEntity<ReservationResponse> update(
            @CurrentUserId UUID ownerId,
            @Valid @RequestBody ReservationRequest request,
            @PathVariable UUID id
    ){
        return ResponseEntity.ok(reservationService.update(ownerId, id, request));
    }
    @GetMapping("/{unitId}/unit")
    public ResponseEntity<List<ReservationResponse>> getAllByUnitId(@CurrentUserId UUID ownerId, @PathVariable UUID unitId) {
        return ResponseEntity.ok(reservationService.listByUnit(ownerId,unitId));
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        reservationService.delete(ownerId, id);
        return ResponseEntity.noContent().build();
    }
}
