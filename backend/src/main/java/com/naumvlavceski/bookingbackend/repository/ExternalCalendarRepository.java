package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.ExternalCalendar;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public interface ExternalCalendarRepository extends JpaRepository<ExternalCalendar, UUID> {
    List<ExternalCalendar> findAllByUnitId(UUID unitId);
}
