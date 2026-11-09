package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.OpenApiConfig;
import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.dto.PropertyRequest;
import com.naumvlavceski.bookingbackend.dto.PropertyResponse;
import com.naumvlavceski.bookingbackend.service.PropertyService;
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
@RequestMapping("/api/properties")
@RequiredArgsConstructor
@Tag(name = OpenApiConfig.TAG_PROPERTIES)
public class PropertyController {

    private final PropertyService propertyService;

    @Operation(summary = "List my properties")
    @GetMapping
    public List<PropertyResponse> list(@CurrentUserId UUID ownerId) {
        return propertyService.findAllForOwner(ownerId);
    }

    @Operation(summary = "Get one property")
    @ApiResponse(responseCode = "200", description = "The property")
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @GetMapping("/{id}")
    public PropertyResponse getOne(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        return propertyService.findOne(ownerId, id);
    }

    @Operation(summary = "Create a property",
            description = "Optionally creates `unitCount` units at the same time, named Room 1, Room 2, ... with "
                    + "capacity 2 (rename them later).")
    @ApiResponse(responseCode = "200", description = "Created")
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @PostMapping
    public ResponseEntity<PropertyResponse> create(@CurrentUserId UUID ownerId, @Valid @RequestBody PropertyRequest request) {
        return ResponseEntity.ok(propertyService.create(ownerId, request));
    }

    @Operation(summary = "Rename a property or change its address",
            description = "`unitCount` is ignored here; add units with POST /api/properties/{propertyId}/units.")
    @ApiResponse(responseCode = "200", description = "Updated")
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @PutMapping("/{id}")
    public PropertyResponse update(@CurrentUserId UUID ownerId, @PathVariable UUID id, @Valid @RequestBody PropertyRequest request) {
        return propertyService.update(ownerId, id, request);
    }

    @Operation(summary = "Delete a property",
            description = "Permanent. Its units, their reservations and their connected calendars are deleted with it.")
    @ApiResponse(responseCode = "204", description = "Deleted")
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        propertyService.delete(ownerId, id);
        return ResponseEntity.noContent().build();
    }
}
