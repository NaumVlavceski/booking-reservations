package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.dto.*;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import com.naumvlavceski.bookingbackend.service.ReservationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
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

    /** Cancelled bookings, paged. Newest cancellation first; with checkInFrom, latest check-in first. */
    @GetMapping("/cancelled")
    public PageResponse<ReservationResponse> cancelled(
            @CurrentUserId UUID ownerId,
            @RequestParam(required = false) String name,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkInFrom,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return reservationService.listCancelled(ownerId, name, checkInFrom, page, size);
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
        if (request.status() == ReservationStatus.CANCELLED) {
            reservationService.delete(ownerId, id);
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok(reservationService.update(ownerId, id, request));
    }
    @GetMapping("/{id}/available-options")
    public List<MoveOptionResponse> moveOptions(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        return reservationService.availableOptions(ownerId, id);
    }

    @PostMapping("/{id}/move")
    public ReservationResponse move(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID id,
            @Valid @RequestBody MoveReservationRequest request
    ) {
        return reservationService.move(ownerId, id, request.unitId());
    }
    @PostMapping("/{id}/copy")
    public List<ReservationResponse> copy(@CurrentUserId UUID ownerId, @PathVariable UUID id,
                                          @Valid @RequestBody CopyReservationRequest request){
        return reservationService.copy(ownerId,id,request.unitIds());
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
