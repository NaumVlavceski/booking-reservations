package com.naumvlavceski.bookingbackend.demo;

import com.naumvlavceski.bookingbackend.config.security.JwtService;
import com.naumvlavceski.bookingbackend.dto.AuthResponse;
import com.naumvlavceski.bookingbackend.exception.DemoRestrictedException;
import com.naumvlavceski.bookingbackend.model.AppUser;
import com.naumvlavceski.bookingbackend.model.Owner;
import com.naumvlavceski.bookingbackend.model.Property;
import com.naumvlavceski.bookingbackend.model.Reservation;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import com.naumvlavceski.bookingbackend.model.Role;
import com.naumvlavceski.bookingbackend.model.Unit;
import com.naumvlavceski.bookingbackend.repository.AppUserRepository;
import com.naumvlavceski.bookingbackend.repository.OwnerRepository;
import com.naumvlavceski.bookingbackend.repository.PropertyRepository;
import com.naumvlavceski.bookingbackend.repository.ReservationRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import com.naumvlavceski.bookingbackend.service.AccountService;
import io.hypersistence.utils.hibernate.type.range.Range;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * "Try the demo" (app.demo.*): every call creates a private account for one visitor, filled with the same fictional
 * sample data (dates relative to today, so the calendar always has past, current and upcoming stays), and signs the
 * visitor in. Nobody else sees it. It is deleted with everything in it once its lifetime is over.
 * <p>
 * The account has a random password nobody knows and an address under the reserved {@code .invalid} domain, so it
 * can only be used through the token returned here and never receives mail. What a demo may not do is in DemoGuard;
 * every demo is an owner marked demo (owner.demo), and only those are ever deleted by the cleanup.
 */
@Slf4j
@Component
@EnableConfigurationProperties(DemoProperties.class)
public class DemoAccounts {
    static final String TERMS_VERSION = "2026-10-31";
    static final String PRIVACY_VERSION = "2026-10-31";
    static final String EMAIL_DOMAIN = "@demo.roomtrack.invalid";
    public static final String NOT_AVAILABLE = "The demo is not available right now.";
    public static final String BUSY = "Too many people are trying the demo right now. Please try again in a few minutes.";

    private static final SecureRandom RANDOM = new SecureRandom();

    private final DemoProperties props;
    private final OwnerRepository owners;
    private final AppUserRepository users;
    private final PropertyRepository properties;
    private final UnitRepository units;
    private final ReservationRepository reservations;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AccountService accountService;
    private final Clock clock;
    private final TransactionTemplate tx;

    DemoAccounts(DemoProperties props, OwnerRepository owners, AppUserRepository users, PropertyRepository properties,
                 UnitRepository units, ReservationRepository reservations, PasswordEncoder passwordEncoder,
                 JwtService jwtService, AccountService accountService, Clock clock,
                 PlatformTransactionManager transactionManager) {
        this.props = props;
        this.owners = owners;
        this.users = users;
        this.properties = properties;
        this.units = units;
        this.reservations = reservations;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.accountService = accountService;
        this.clock = clock;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** "1 hour", "90 minutes": a lifetime in words, for the docs and messages. */
    public static String describe(Duration lifetime) {
        long minutes = lifetime.toMinutes();
        if (minutes % 60 == 0) return minutes == 60 ? "1 hour" : (minutes / 60) + " hours";
        return minutes + " minutes";
    }

    /**
     * A new demo for one visitor, signed in. 404 when the demo is off; 403 DEMO_RESTRICTED when {@code max-active}
     * demos already exist (the per-IP limit is in AuthController).
     */
    public AuthResponse start() {
        if (!props.enabled()) throw new NoSuchElementException(NOT_AVAILABLE);
        if (owners.countByDemoTrue() >= props.maxActive()) throw new DemoRestrictedException(BUSY);
        AppUser user = tx.execute(status -> create());
        String token = jwtService.generateToken(user);
        log.info("Demo started");
        return new AuthResponse(token, user.getEmail(), user.getFullName());
    }

    private AppUser create() {
        Owner owner = new Owner();
        owner.setDemo(true);
        owner.setActive(true);
        owner.setNotificationsEnabled(false);
        owner = owners.save(owner);

        OffsetDateTime now = OffsetDateTime.now(clock);
        byte[] id = new byte[8];
        RANDOM.nextBytes(id);
        AppUser user = new AppUser();
        user.setOwner(owner);
        user.setEmail("demo-" + HexFormat.of().formatHex(id) + EMAIL_DOMAIN);
        user.setPasswordHash(passwordEncoder.encode(UUID.randomUUID().toString())); // nobody knows it
        user.setFullName("Demo visitor");
        user.setRole(Role.OWNER);
        user.setEmailVerifiedAt(now);
        user.setTermsAcceptedAt(now);
        user.setTermsVersion(TERMS_VERSION);
        user.setPrivacyVersion(PRIVACY_VERSION);
        user.setLastLoginAt(LocalDateTime.now());
        user = users.save(user);

        seed(owner, LocalDate.now(clock));
        return user;
    }

    /** Every 5 minutes: deletes the demos older than their lifetime, or every demo when the demo is switched off. */
    @Scheduled(cron = "0 */5 * * * *", zone = "UTC")
    public void cleanup() {
        int deleted = deleteExpired();
        if (deleted > 0) log.info("Deleted {} expired demo account(s)", deleted);
    }

    /** Deletes expired demos (all demos when the demo is off), each in its own transaction. Returns how many. */
    public int deleteExpired() {
        // owner.created_at is written in the JVM's zone (@CreationTimestamp), so compare in the same zone
        List<Owner> expired = props.enabled()
                ? owners.findAllByDemoTrueAndCreatedAtBefore(LocalDateTime.now().minus(props.lifetime()))
                : owners.findAllByDemoTrue();
        int deleted = 0;
        for (Owner owner : expired) {
            try {
                accountService.deleteOwnerData(owner.getId());
                deleted++;
            } catch (RuntimeException e) {
                log.warn("Could not delete demo owner {}: {}", owner.getId(), e.toString());
            }
        }
        return deleted;
    }

    /** Fictional properties, rooms and guests. No two live stays of one room overlap (the database would refuse it). */
    private void seed(Owner owner, LocalDate today) {
        Property lakeside = property(owner, "Lakeside Apartments", "Sample Street 12, Ohrid");
        Unit studio1 = unit(lakeside, "Studio 1", 2);
        Unit studio2 = unit(lakeside, "Studio 2", 2);
        Unit family = unit(lakeside, "Family Apartment", 4);
        Property oldTown = property(owner, "Old Town Rooms", "Sample Square 3, Skopje");
        Unit roomA = unit(oldTown, "Room A", 2);
        Unit roomB = unit(oldTown, "Room B", 3);

        var b = new Batch(today);
        // Studio 1: back-to-back stays (check-out day = next check-in day), a stay without an amount yet,
        // an imported stay whose dates changed after its price was entered, and a cancelled one
        b.add(studio1, -21, -17, ReservationStatus.PAID, ReservationSource.DIRECT, "Ana Kovač", 2, "240.00", "60.00");
        b.add(studio1, -17, -13, ReservationStatus.CONFIRMED, ReservationSource.BOOKING, "Jonas Weber", 2, "300.00", null);
        b.add(studio1, -5, -1, ReservationStatus.PAID, ReservationSource.DIRECT, "Marko Ilievski", 2, "220.00", "55.00");
        b.add(studio1, -1, 3, ReservationStatus.CONFIRMED, ReservationSource.BOOKING, "Sofia Rossi", 2, "280.00", null);
        b.add(studio1, 5, 9, ReservationStatus.CONFIRMED, ReservationSource.DIRECT, "Petra Novak", 1, null, null);
        b.add(studio1, 10, 14, ReservationStatus.CONFIRMED, ReservationSource.BOOKING, "Lukas Schmidt", 2, "320.00", null)
                .setPriceNeedsReview(true);
        b.add(studio1, 20, 25, ReservationStatus.CANCELLED, ReservationSource.DIRECT, "Ivan Horvat", 2, "350.00", "70.00");
        // Studio 2: the owner closed two nights for maintenance (BLOCK)
        b.add(studio2, -14, -10, ReservationStatus.PAID, ReservationSource.DIRECT, "Emma Laurent", 2, "200.00", "50.00");
        b.add(studio2, -3, 2, ReservationStatus.CONFIRMED, ReservationSource.BOOKING, "Daniel Kim", 2, "350.00", null);
        b.add(studio2, 2, 4, ReservationStatus.BLOCK, ReservationSource.DIRECT, null, 1, null, null).setNotes("Painting");
        b.add(studio2, 7, 12, ReservationStatus.CONFIRMED, ReservationSource.DIRECT, "Nina Jovanović", 2, "375.00", "75.00");
        // Family Apartment
        b.add(family, -25, -18, ReservationStatus.PAID, ReservationSource.DIRECT, "Berisha family", 4, "630.00", "90.00");
        b.add(family, -8, -2, ReservationStatus.PAID, ReservationSource.BOOKING, "Clara Müller", 3, "540.00", null);
        b.add(family, 1, 5, ReservationStatus.CONFIRMED, ReservationSource.DIRECT, "Tomasz Kowalski", 4, "700.00", "100.00")
                .setNotes("Needs a baby cot");
        b.add(family, 15, 19, ReservationStatus.CONFIRMED, ReservationSource.BOOKING, "Aylin Demir", 3, null, null);
        // Room A: a stay that ended but was never marked as paid (the demo's checklist names this guest)
        b.add(roomA, -12, -9, ReservationStatus.CONFIRMED, ReservationSource.DIRECT, "Stefan Popov", 1, "120.00", "40.00");
        b.add(roomA, -2, 1, ReservationStatus.CONFIRMED, ReservationSource.BOOKING, "Laura García", 2, "135.00", null);
        b.add(roomA, 5, 9, ReservationStatus.CONFIRMED, ReservationSource.DIRECT, "Miha Zupan", 2, "180.00", "45.00");
        b.add(roomA, 9, 11, ReservationStatus.CANCELLED, ReservationSource.BOOKING, "Oliver Brown", 2, "95.00", null);
        // Room B
        b.add(roomB, -6, -3, ReservationStatus.PAID, ReservationSource.DIRECT, "Elif Yılmaz", 3, "165.00", "55.00");
        b.add(roomB, 4, 7, ReservationStatus.BLOCK, ReservationSource.DIRECT, null, 1, null, null)
                .setNotes("Owner's family visiting");
        b.add(roomB, 12, 16, ReservationStatus.CONFIRMED, ReservationSource.BOOKING, "Hannah Fischer", 2, "260.00", null);
    }

    private Property property(Owner owner, String name, String address) {
        Property p = new Property();
        p.setOwner(owner);
        p.setName(name);
        p.setAddress(address);
        return properties.save(p);
    }

    private Unit unit(Property property, String name, int capacity) {
        Unit u = new Unit();
        u.setProperty(property);
        u.setOwnerId(property.getOwner().getId());
        u.setName(name);
        u.setCapacity(capacity);
        return units.save(u);
    }

    /** Saves reservations with nights counted from today (negative = in the past). */
    private final class Batch {
        private final LocalDate today;

        Batch(LocalDate today) {
            this.today = today;
        }

        Reservation add(Unit unit, int fromDay, int toDay, ReservationStatus status, ReservationSource source,
                        String guest, int guests, String total, String nightly) {
            Reservation r = new Reservation();
            r.setUnit(unit);
            r.setOwnerId(unit.getOwnerId());
            r.setStayRange(Range.closedOpen(today.plusDays(fromDay), today.plusDays(toDay)));
            r.setStatus(status);
            r.setSource(source);
            r.setGuestName(guest);
            r.setGuestsCount(guests);
            r.setTotalAmount(total == null ? null : new BigDecimal(total));
            r.setNightlyRate(nightly == null ? null : new BigDecimal(nightly));
            return reservations.save(r);
        }
    }
}
