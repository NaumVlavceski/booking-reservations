package com.naumvlavceski.bookingbackend.mail;

import com.naumvlavceski.bookingbackend.model.EmailLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface EmailLogRepository extends JpaRepository<EmailLog, UUID> {
}
