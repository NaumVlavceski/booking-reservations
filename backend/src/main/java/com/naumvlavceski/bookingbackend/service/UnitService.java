package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.dto.UnitRequest;
import com.naumvlavceski.bookingbackend.dto.UnitResponse;
import com.naumvlavceski.bookingbackend.model.Property;
import com.naumvlavceski.bookingbackend.model.Unit;
import com.naumvlavceski.bookingbackend.repository.PropertyRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UnitService {

    private final UnitRepository unitRepository;
    private final PropertyRepository propertyRepository;

    public List<UnitResponse> findAllByOwner(UUID ownerId) {
        return unitRepository.findAllByOwnerId(ownerId).stream()
                .map(this::toResponse)
                .toList();
    }

    public List<UnitResponse> findAllUnitsFromPropertyAndOwner(UUID ownerId, UUID propertyId) {
        return unitRepository.findAllByPropertyIdAndOwnerId(propertyId, ownerId)
                .stream().map(this::toResponse).toList();
    }
    public UnitResponse findOne(UUID ownerId, UUID unitId){
        Unit unit = unitRepository.findByIdAndOwnerId(unitId,ownerId).orElseThrow(()->new NoSuchElementException("Unit not found"));
        return toResponse(unit);
    }
    @Transactional
    public UnitResponse create(UUID ownerId, UUID propertyId, UnitRequest request) {
        Property property = propertyRepository.findByIdAndOwnerId(propertyId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Property not found"));

        Unit unit = new Unit();
        unit.setOwnerId(ownerId);
        unit.setProperty(property);
        unit.setName(request.name());
        unit.setCapacity(request.capacity());
        unit.setBasePrice(request.basePrice());

        return toResponse(unitRepository.save(unit));
    }

    @Transactional
    public UnitResponse update(UUID ownerId, UUID unitId, UnitRequest request) {
        Unit unit = unitRepository.findByIdAndOwnerId(unitId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Unit not found"));

        unit.setName(request.name());
        unit.setCapacity(request.capacity());
        unit.setBasePrice(request.basePrice());

        return toResponse(unitRepository.save(unit));
    }

    @Transactional
    public void delete(UUID ownerId, UUID unitId) {
        Unit unit = unitRepository.findByIdAndOwnerId(unitId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Unit not found"));
        unitRepository.delete(unit);
    }

    private UnitResponse toResponse(Unit u) {
        return new UnitResponse(u.getId(), u.getProperty().getId(), u.getName(), u.getCapacity(), u.getBasePrice());
    }
}