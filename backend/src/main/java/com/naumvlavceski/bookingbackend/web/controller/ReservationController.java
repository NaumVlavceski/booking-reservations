package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.OpenApiConfig;
import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.dto.*;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import com.naumvlavceski.bookingbackend.service.ReservationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = OpenApiConfig.TAG_RESERVATIONS)
public class ReservationController {
    private final ReservationService reservationService;

    @Operation(summary = "List my reservations",
            description = "Sorted by check-in. Without `status`, every reservation except CANCELLED ones.")
    @GetMapping
    public List<ReservationResponse> list(
            @CurrentUserId UUID ownerId,
            @Parameter(description = "Only this unit") @RequestParam(required = false) UUID unitId,
            @Parameter(description = "Only this status (CANCELLED included when asked for)")
            @RequestParam(required = false) ReservationStatus status
    ) {
        return reservationService.findAllForOwner(ownerId, unitId, status);
    }

    /** Cancelled bookings, paged. Newest cancellation first; with checkInFrom, latest check-in first. */
    @Operation(summary = "List cancelled reservations (paged)",
            description = "Newest cancellation first; with `checkInFrom`, latest check-in first.")
    @ApiResponse(responseCode = "200", description = "One page")
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @GetMapping("/cancelled")
    public PageResponse<ReservationResponse> cancelled(
            @CurrentUserId UUID ownerId,
            @Parameter(description = "Guest name starts with this (case-insensitive)", example = "Ana")
            @RequestParam(required = false) String name,
            @Parameter(description = "Only stays checking in on or after this date (yyyy-MM-dd)", example = "2026-07-01")
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate checkInFrom,
            @Parameter(description = "Page number, from 0") @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Page size, 1 to 100") @RequestParam(defaultValue = "20") int size
    ) {
        return reservationService.listCancelled(ownerId, name, checkInFrom, page, size);
    }

    @Operation(summary = "Get one reservation")
    @ApiResponse(responseCode = "200", description = "The reservation")
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @GetMapping("/{id}")
    public ReservationResponse getOne(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        return reservationService.findOneForOwner(ownerId, id);
    }

    @Operation(summary = "Create a reservation",
            description = "A direct booking (source DIRECT). `status` defaults to CONFIRMED and `guestsCount` to 2. "
                    + "Refused with 409 when the unit already has a live booking on any of the nights; "
                    + "`checkOut` is the departure day, so back-to-back stays are fine.")
    @ApiResponse(responseCode = "200", description = "Created")
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @ApiResponse(responseCode = "409", ref = OpenApiConfig.DATES_TAKEN)
    @PostMapping
    public ResponseEntity<ReservationResponse> create(
            @CurrentUserId UUID ownerId,
            @Valid @RequestBody ReservationRequest request
    ) {
        return ResponseEntity.ok(reservationService.create(ownerId, request));
    }

    @Operation(summary = "Change a reservation",
            description = "Replaces every field (send the whole reservation). Without `status` the current one "
                    + "stays. `status: CANCELLED` cancels it and answers 204 with no body; sending another status "
                    + "for a cancelled reservation restores it if the nights are still free. Saving clears "
                    + "`priceNeedsReview`.")
    @ApiResponse(responseCode = "200", description = "Updated")
    @ApiResponse(responseCode = "204", description = "Cancelled (the request had status CANCELLED)")
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @ApiResponse(responseCode = "409", ref = OpenApiConfig.DATES_TAKEN)
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

    @Operation(summary = "Units this reservation can move to",
            description = "The other units of the same property that are free for all of its nights. Empty for a "
                    + "cancelled reservation.")
    @ApiResponse(responseCode = "200", description = "Free units")
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @GetMapping("/{id}/available-options")
    public List<MoveOptionResponse> moveOptions(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        return reservationService.availableOptions(ownerId, id);
    }

    @Operation(summary = "Move a reservation to another unit",
            description = "Same dates, another unit of the same property. 409 if that unit is taken on any of the nights.")
    @ApiResponse(responseCode = "200", description = "Moved")
    @ApiResponse(responseCode = "400", description = "Cancelled reservation, same unit, or a unit of another property",
            ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @ApiResponse(responseCode = "409", ref = OpenApiConfig.DATES_TAKEN)
    @PostMapping("/{id}/move")
    public ReservationResponse move(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID id,
            @Valid @RequestBody MoveReservationRequest request
    ) {
        return reservationService.move(ownerId, id, request.unitId());
    }

    @Operation(summary = "Copy a reservation to other units",
            description = "For a group booking several units: one new reservation per unit, same dates, status, "
                    + "guest and notes (amounts are not copied). All or nothing: if one unit is taken, none is created.")
    @ApiResponse(responseCode = "200", description = "The new reservations")
    @ApiResponse(responseCode = "400", description = "Cancelled reservation, or a unit that is the same or of another property",
            ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @ApiResponse(responseCode = "409", ref = OpenApiConfig.DATES_TAKEN)
    @PostMapping("/{id}/copy")
    public List<ReservationResponse> copy(@CurrentUserId UUID ownerId, @PathVariable UUID id,
                                          @Valid @RequestBody CopyReservationRequest request){
        return reservationService.copy(ownerId,id,request.unitIds());
    }

    @Operation(summary = "List every reservation of one unit",
            description = "Cancelled ones included, in no particular order. Note the path: the id is the unit's.")
    @GetMapping("/{unitId}/unit")
    public ResponseEntity<List<ReservationResponse>> getAllByUnitId(@CurrentUserId UUID ownerId, @PathVariable UUID unitId) {
        return ResponseEntity.ok(reservationService.listByUnit(ownerId,unitId));
    }

    @Operation(summary = "Cancel a reservation",
            description = "Not a hard delete: the status becomes CANCELLED, the nights become free, and the "
                    + "reservation moves to the cancelled list (it can be restored with PUT).")
    @ApiResponse(responseCode = "204", description = "Cancelled")
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        reservationService.delete(ownerId, id);
        return ResponseEntity.noContent().build();
    }
}
