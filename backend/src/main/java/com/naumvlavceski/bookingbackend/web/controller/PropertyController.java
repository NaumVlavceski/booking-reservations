package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.dto.PropertyRequest;
import com.naumvlavceski.bookingbackend.dto.PropertyResponse;
import com.naumvlavceski.bookingbackend.service.PropertyService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/properties")
@RequiredArgsConstructor
public class PropertyController {

    private final PropertyService propertyService;

    @GetMapping
    public List<PropertyResponse> list(@CurrentUserId UUID ownerId) {
        return propertyService.findAllForOwner(ownerId);
    }

    @GetMapping("/{id}")
    public PropertyResponse getOne(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        return propertyService.findOne(ownerId, id);
    }

    @PostMapping
    public ResponseEntity<PropertyResponse> create(@CurrentUserId UUID ownerId, @Valid @RequestBody PropertyRequest request) {
        return ResponseEntity.ok(propertyService.create(ownerId, request));
    }

    @PutMapping("/{id}")
    public PropertyResponse update(@CurrentUserId UUID ownerId, @PathVariable UUID id, @Valid @RequestBody PropertyRequest request) {
        return propertyService.update(ownerId, id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@CurrentUserId UUID ownerId, @PathVariable UUID id) {
        propertyService.delete(ownerId, id);
        return ResponseEntity.noContent().build();
    }
}