package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.OpenApiConfig;
import com.naumvlavceski.bookingbackend.dto.UnitRequest;
import com.naumvlavceski.bookingbackend.dto.UnitResponse;
import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.service.UnitService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
@Tag(name = OpenApiConfig.TAG_UNITS)
public class UnitController {

    private final UnitService unitService;

    @Operation(summary = "List all my units", description = "Every unit of every property of the signed-in owner.")
    @GetMapping("/api/units")
    public List<UnitResponse> listAllForOwner(@CurrentUserId UUID ownerId) {
        return unitService.findAllByOwner(ownerId);
    }

    @Operation(summary = "List the units of a property")
    @ApiResponse(responseCode = "200", description = "The units (empty if the property has none, or is not yours)")
    @GetMapping("/api/properties/{propertyId}/units")
    public List<UnitResponse> listForProperty(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID propertyId
    ) {
        return unitService.findAllUnitsFromPropertyAndOwner(ownerId, propertyId);
    }

    @Operation(summary = "Get one unit")
    @ApiResponse(responseCode = "200", description = "The unit")
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @GetMapping("/api/units/{unitId}")
    public ResponseEntity<UnitResponse> getUnit(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID unitId
    ){
        return ResponseEntity.ok(unitService.findOne(ownerId,unitId));
    }

    @Operation(summary = "Add a unit to a property",
            description = "The new unit gets its own random calendar feed token (see `token`).")
    @ApiResponse(responseCode = "200", description = "Created")
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @PostMapping("/api/properties/{propertyId}/units")
    public ResponseEntity<UnitResponse> create(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID propertyId,
            @Valid @RequestBody UnitRequest request
    ) {
        return ResponseEntity.ok(unitService.create(ownerId, propertyId, request));
    }

    @Operation(summary = "Rename a unit or change its capacity")
    @ApiResponse(responseCode = "200", description = "Updated")
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @PutMapping("/api/units/{unitId}")
    public UnitResponse update(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID unitId,
            @Valid @RequestBody UnitRequest request
    ) {
        return unitService.update(ownerId, unitId, request);
    }

    @Operation(summary = "Delete a unit",
            description = "Permanent. Its reservations and connected calendars are deleted with it, and its "
                    + "calendar feed link stops working.")
    @ApiResponse(responseCode = "204", description = "Deleted")
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @DeleteMapping("/api/units/{unitId}")
    public ResponseEntity<Void> delete(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID unitId
    ) {
        unitService.delete(ownerId, unitId);
        return ResponseEntity.noContent().build();
    }
}
