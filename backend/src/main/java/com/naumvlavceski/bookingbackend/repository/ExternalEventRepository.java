package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.ExternalEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ExternalEventRepository extends JpaRepository<ExternalEvent, UUID> {
    Optional<ExternalEvent> findByExternalCalendarIdAndUid(UUID externalCalendarId, String uid);
    List<ExternalEvent> findAllByExternalCalendarId(UUID externalCalendarId);

}
