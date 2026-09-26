package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.dto.PropertyRequest;
import com.naumvlavceski.bookingbackend.dto.PropertyResponse;
import com.naumvlavceski.bookingbackend.model.Owner;
import com.naumvlavceski.bookingbackend.model.Property;
import com.naumvlavceski.bookingbackend.model.Unit;
import com.naumvlavceski.bookingbackend.repository.OwnerRepository;
import com.naumvlavceski.bookingbackend.repository.PropertyRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@AllArgsConstructor
public class PropertyService {
    private static final int MAX_INITIAL_UNITS = 200;
    private static final int DEFAULT_UNIT_CAPACITY = 2;

    private final PropertyRepository propertyRepository;
    private final OwnerRepository ownerRepository;
    private final UnitRepository unitRepository;

    public List<PropertyResponse> findAllForOwner(UUID ownerId){
        return propertyRepository.findAllByOwnerId(ownerId).stream()
                .map(this::toResponse)
                .toList();
    }
    public PropertyResponse findOne(UUID ownerId,UUID propertyId){
        Property property = propertyRepository.findByIdAndOwnerId(propertyId,ownerId).orElseThrow(()->new NoSuchElementException("Property not found"));
        return toResponse(property);
    }

    @Transactional
    public PropertyResponse create(UUID ownerId, PropertyRequest propertyRequest){
        int unitCount = propertyRequest.unitCount() != null ? propertyRequest.unitCount() : 0;
        if (unitCount < 0 || unitCount > MAX_INITIAL_UNITS) {
            throw new IllegalArgumentException("Number of rooms must be between 0 and " + MAX_INITIAL_UNITS);
        }

        Owner owner = ownerRepository.findById(ownerId).orElseThrow(()->new NoSuchElementException("Owner not found"));
        Property property = new Property();
        property.setOwner(owner);
        property.setName(propertyRequest.name());
        property.setAddress(propertyRequest.address());
        property.setTimezone(propertyRequest.timezone() != null ? propertyRequest.timezone() : "Europe/Skopje");
        Property saved = propertyRepository.save(property);

        List<Unit> units = new ArrayList<>(unitCount);
        for (int i = 1; i <= unitCount; i++) {
            Unit unit = new Unit();
            unit.setOwnerId(ownerId);
            unit.setProperty(saved);
            unit.setName("Room " + i);
            unit.setCapacity(DEFAULT_UNIT_CAPACITY);
            units.add(unit);
        }
        unitRepository.saveAll(units);

        return toResponse(saved);
    }
    @Transactional
    public PropertyResponse update(UUID ownerId, UUID propertyId, PropertyRequest request) {
        Property property = propertyRepository.findByIdAndOwnerId(propertyId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Property not found"));

        property.setName(request.name());
        property.setAddress(request.address());
        if (request.timezone() != null) {
            property.setTimezone(request.timezone());
        }

        return toResponse(propertyRepository.save(property));
    }
    @Transactional
    public void delete(UUID ownerId, UUID propertyId) {
        Property property = propertyRepository.findByIdAndOwnerId(propertyId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Property not found"));
        // ON DELETE CASCADE (V4 migration) removes its units and their reservations.
        propertyRepository.delete(property);
    }
    private PropertyResponse toResponse(Property p) {
        return new PropertyResponse(p.getId(), p.getName(), p.getAddress(), p.getTimezone(), p.getCreatedAt());
    }
}
