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

    /** Resend webhook: bounced / complained always win. */
    @Modifying
    @Query("update EmailLog e set e.status = :status, e.updatedAt = :now where e.providerId = :providerId")
    int updateStatusByProviderId(@Param("providerId") String providerId, @Param("status") String status,
                                 @Param("now") OffsetDateTime now);

    /** Resend webhook: "delivered" never overwrites a bounce or complaint that arrived first. */
    @Modifying
    @Query("update EmailLog e set e.status = 'DELIVERED', e.updatedAt = :now "
            + "where e.providerId = :providerId and e.status not in ('BOUNCED', 'COMPLAINED')")
    int markDelivered(@Param("providerId") String providerId, @Param("now") OffsetDateTime now);
}
