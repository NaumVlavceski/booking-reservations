package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.dto.SyncConflictResponse;
import com.naumvlavceski.bookingbackend.model.ConflictStatus;
import com.naumvlavceski.bookingbackend.model.SyncConflict;
import com.naumvlavceski.bookingbackend.model.Unit;
import com.naumvlavceski.bookingbackend.repository.SyncConflictRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SyncConflictService {
    private final SyncConflictRepository repo;
    private final UnitRepository unitRepository;

    @Transactional
    public List<SyncConflictResponse> listOpen(UUID ownerId) {
        List<SyncConflict> open =
                repo.findAllByOwnerIdAndStatusOrderByCreatedAtDesc(ownerId, ConflictStatus.OPEN);
        Map<UUID, String> unitNames = unitRepository
                .findAllById(open.stream().map(SyncConflict::getUnitId).distinct().toList())
                .stream().collect(Collectors.toMap(Unit::getId, Unit::getName));
        return open.stream()
                .map(c -> SyncConflictResponse.from(c, unitNames.get(c.getUnitId())))
                .toList();
    }

    @Transactional
    public void dismiss(UUID ownerId, UUID id) {
        SyncConflict conflict = repo.findByIdAndOwnerId(id, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Conflict not found"));
        conflict.setStatus(ConflictStatus.DISMISSED);
        conflict.setResolvedAt(LocalDateTime.now());
    }
}
