package com.naumvlavceski.bookingbackend.demo;

import com.naumvlavceski.bookingbackend.exception.DemoRestrictedException;
import com.naumvlavceski.bookingbackend.repository.OwnerRepository;
import com.naumvlavceski.bookingbackend.repository.PropertyRepository;
import com.naumvlavceski.bookingbackend.repository.ReservationRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * What a demo (DemoAccounts) may not do. Anyone can start one without signing up, so: no password change and no
 * account deletion (it must not turn into a lasting account, and it is deleted on its own), no emails (test email,
 * booking notifications), no calendar links (the server would fetch any address a visitor typed), and size caps so a
 * demo stays small. Checked on the server; the frontend only explains it. Decided by the owner's demo flag.
 */
@Component
@RequiredArgsConstructor
public class DemoGuard {
    public static final String RESTRICTED = "This is turned off in the demo account.";
    public static final String FULL = "This demo is full. Start a new demo to begin again.";

    static final int MAX_PROPERTIES = 10;
    static final int MAX_UNITS = 50;
    static final int MAX_RESERVATIONS = 500;

    private final OwnerRepository owners;
    private final PropertyRepository properties;
    private final UnitRepository units;
    private final ReservationRepository reservations;

    public boolean isDemo(UUID ownerId) {
        return ownerId != null && owners.existsByIdAndDemoTrue(ownerId);
    }

    public void requireNotDemo(UUID ownerId) {
        if (isDemo(ownerId)) throw new DemoRestrictedException(RESTRICTED);
    }

    /** Before creating a property together with {@code newUnits} units. */
    public void requireRoomForProperty(UUID ownerId, int newUnits) {
        if (!isDemo(ownerId)) return;
        if (properties.countByOwnerId(ownerId) + 1 > MAX_PROPERTIES
                || units.countByOwnerId(ownerId) + newUnits > MAX_UNITS) {
            throw new DemoRestrictedException(FULL);
        }
    }

    public void requireRoomForUnit(UUID ownerId) {
        if (isDemo(ownerId) && units.countByOwnerId(ownerId) + 1 > MAX_UNITS) throw new DemoRestrictedException(FULL);
    }

    public void requireRoomForReservations(UUID ownerId, int newReservations) {
        if (isDemo(ownerId) && reservations.countByOwnerId(ownerId) + newReservations > MAX_RESERVATIONS) {
            throw new DemoRestrictedException(FULL);
        }
    }
}
