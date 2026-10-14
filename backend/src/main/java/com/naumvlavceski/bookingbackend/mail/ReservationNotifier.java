package com.naumvlavceski.bookingbackend.mail;

import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.Unit;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.OwnerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

/**
 * Booking-related emails to the owner (new, changed, cancelled reservations, failing syncs).
 * Owners can switch these off; account emails such as sign-up codes or password resets must
 * not go through here, because they have to be delivered regardless of that switch.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ReservationNotifier {
    private final EmailService emailService;
    private final AppUserRepository appUserRepository;
    private final OwnerRepository ownerRepository;
    private final UnsubscribeLinks unsubscribeLinks;

    public void externalReservationImported(Unit unit, ReservationSource platform,
                                            LocalDate start, LocalDate end, String guest) {
        dispatch(build(unit, NotificationRenderer.IMPORTED, platform, start, end, null, null, guest, null));
    }

    public void externalReservationCancelled(Unit unit, ReservationSource platform,
                                             LocalDate start, LocalDate end, String guest) {
        dispatch(build(unit, NotificationRenderer.CANCELLED, platform, start, end, null, null, guest, null));
    }

    public void externalReservationModified(Unit unit, ReservationSource platform,
                                            LocalDate oldStart, LocalDate oldEnd,
                                            LocalDate start, LocalDate end, String guest, BigDecimal keptPrice) {
        String priceNote = keptPrice == null ? null : keptPrice.stripTrailingZeros().toPlainString();
        dispatch(build(unit, NotificationRenderer.MODIFIED, platform, start, end, oldStart, oldEnd, guest, priceNote));
    }

    public void calendarSyncFailing(Unit unit, ReservationSource platform, int failures, String error) {
        String reason = (error == null || error.isBlank()) ? "Unknown error" : error;
        dispatch(build(unit, NotificationRenderer.SYNC_FAILING, platform, null, null, null, null, null,
                "Failed " + failures + " times in a row. Last error: " + reason));
    }

   public void bookingConflict(Unit unit, ReservationSource platform, boolean changedBooking,
                                LocalDate incomingStart, LocalDate incomingEnd, String incomingSummary,
                                ReservationSource existingSource, LocalDate existingStart, LocalDate existingEnd,
                                String existingGuest) {
        String existing = NotificationRenderer.dates(existingStart, existingEnd)
                + " (" + existingSource.name().charAt(0) + existingSource.name().substring(1).toLowerCase()
                + (existingGuest == null || existingGuest.isBlank() ? "" : ", " + existingGuest) + ")";
        dispatch(build(unit, changedBooking ? NotificationRenderer.CONFLICT_CHANGED : NotificationRenderer.CONFLICT_NEW,
                platform, incomingStart, incomingEnd, null, null, incomingSummary, existing));
    }

    private Notification build(Unit unit, String type, ReservationSource platform,
                               LocalDate start, LocalDate end, LocalDate prevStart, LocalDate prevEnd,
                               String guest, String detail) {
        String platformName = platform.name().charAt(0) + platform.name().substring(1).toLowerCase();
        return new Notification(unit.getOwnerId(), type,
                unit.getProperty().getName() + " / " + unit.getName(), platformName,
                start, end, prevStart, prevEnd, guest, detail);
    }

    private void dispatch(Notification n) {
        // Never let a notification problem break the sync that triggered it
        try {
            boolean enabled = ownerRepository.findById(n.ownerId())
                    .map(o -> o.isNotificationsEnabled()).orElse(true);
            if (enabled) afterCommit(() -> send(n));
        } catch (Exception ex) {
            log.warn("Could not queue {} notification for owner {}", n.type(), n.ownerId(), ex);
        }
    }

    /** Emails go out only once the surrounding transaction commits, so a rollback never produces one. */
    private void afterCommit(Runnable send) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { send.run(); }
            });
        } else {
            send.run();
        }
    }

    private void send(Notification n) {
        try {
            String unsubscribeUrl = unsubscribeLinks.url(n.ownerId());
            var mail = NotificationRenderer.render(n, unsubscribeUrl);
            // RFC 8058 one-click unsubscribe, which Gmail and Yahoo expect from automated mail
            var headers = Map.of(
                    "List-Unsubscribe", "<" + unsubscribeUrl + ">",
                    "List-Unsubscribe-Post", "List-Unsubscribe=One-Click");
            appUserRepository.findAllByOwnerIdAndActiveTrue(n.ownerId()).forEach(u ->
                    emailService.send(n.ownerId(), n.type(),
                            new EmailMessage(u.getEmail(), mail.subject(), mail.html(), mail.text(), headers)));
        } catch (Exception ex) {
            log.warn("Could not send {} notification for owner {}", n.type(), n.ownerId(), ex);
        }
    }
}
