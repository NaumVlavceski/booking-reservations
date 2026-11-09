package com.naumvlavceski.bookingbackend.mail;

import com.naumvlavceski.bookingbackend.model.EmailLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.UUID;

public interface EmailLogRepository extends JpaRepository<EmailLog, UUID> {

    /** Retention: the log keeps recipient addresses, so old rows go (see EmailLogCleanupScheduler). */
    @Modifying
    @Query("delete from EmailLog e where e.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") OffsetDateTime cutoff);
}
