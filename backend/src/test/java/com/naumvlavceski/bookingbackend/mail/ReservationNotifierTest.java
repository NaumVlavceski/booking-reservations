package com.naumvlavceski.bookingbackend.mail;

import com.naumvlavceski.bookingbackend.model.*;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.OwnerRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class ReservationNotifierTest {

    EmailService emailService = mock(EmailService.class);
    AppUserRepository users = mock(AppUserRepository.class);
    OwnerRepository owners = mock(OwnerRepository.class);
    UnsubscribeLinks links = new UnsubscribeLinks("test-secret-test-secret-test-secret-12", "https://api.roomtrack.app");
    ReservationNotifier notifier = new ReservationNotifier(emailService, users, owners, links);

    UUID ownerId = UUID.randomUUID();
    Owner owner = new Owner();
    Unit unit = new Unit();

    @BeforeEach
    void setUp() {
        Property property = new Property();
        property.setName("Villa");
        unit.setProperty(property);
        unit.setName("Room 1");
        unit.setOwnerId(ownerId);

        AppUser user = new AppUser();
        user.setEmail("owner@example.com");
        when(owners.findById(ownerId)).thenReturn(Optional.of(owner));
        when(users.findAllByOwnerIdAndActiveTrue(ownerId)).thenReturn(List.of(user));
    }

    private void importOne() {
        notifier.externalReservationImported(unit, ReservationSource.AIRBNB,
                LocalDate.now().plusDays(5), LocalDate.now().plusDays(8), "Jane <b>Doe</b>");
    }

    @Test
    void sendsWhenEnabled() {
        importOne();
        ArgumentCaptor<EmailMessage> msg = ArgumentCaptor.forClass(EmailMessage.class);
        verify(emailService).send(eq(ownerId), eq("EXTERNAL_RESERVATION_IMPORTED"), msg.capture());
        assertEquals("owner@example.com", msg.getValue().to());
        assertEquals("New Airbnb reservation: Villa / Room 1", msg.getValue().subject());
        assertFalse(msg.getValue().html().contains("<b>Doe</b>"), "guest name must be HTML-escaped");
        assertTrue(msg.getValue().html().contains(links.url(ownerId)), "unsubscribe link in the body");
        assertTrue(msg.getValue().text().contains(links.url(ownerId)));
        assertEquals("List-Unsubscribe=One-Click", msg.getValue().headers().get("List-Unsubscribe-Post"));
        assertEquals("<" + links.url(ownerId) + ">", msg.getValue().headers().get("List-Unsubscribe"));
    }

    @Test
    void sendsNothingWhenOwnerTurnedNotificationsOff() {
        owner.setNotificationsEnabled(false);
        importOne();
        notifier.calendarSyncFailing(unit, ReservationSource.BOOKING, 3, "HTTP 404");
        verify(emailService, never()).send(any(), any(), any());
    }
}
