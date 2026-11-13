package com.naumvlavceski.bookingbackend.audit.ical;

import com.naumvlavceski.bookingbackend.model.Reservation;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import com.naumvlavceski.bookingbackend.model.Unit;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import io.hypersistence.utils.hibernate.type.range.Range;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static com.naumvlavceski.bookingbackend.audit.AuditTestBase.reservationJson;
import static com.naumvlavceski.bookingbackend.audit.ical.Feeds.calendar;
import static com.naumvlavceski.bookingbackend.audit.ical.Feeds.event;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Syncs racing each other, and syncs racing an owner who books or disconnects at the same moment. */
class IcalSyncConcurrencyAuditTest extends IcalAuditSupport {

    private static final String SAVE_FAILED = "The bookings from this calendar could not be saved.";

    @Autowired private PlatformTransactionManager txManager;
    @Autowired private UnitRepository units;

    private final ExecutorService pool = Executors.newCachedThreadPool();

    @org.junit.jupiter.api.AfterEach
    void stopPool() {
        pool.shutdownNow();
    }

    private void slowFeed(String path, String feed, long delayMs) {
        stub.handle(path, e -> {
            try { Thread.sleep(delayMs); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); }
            StubFeedServer.respond(e, 200, feed);
        });
    }

    @Test
    void twoSyncsOfOneCalendarAtOnceFetchOnceAndImportOnce() throws Exception {
        Room room = newOwnerRoom();
        slowFeed("/f", calendar(event("c1@booking.com", inDays(10), inDays(12), "A"),
                event("c2@booking.com", inDays(20), inDays(22), "B")), 1_500);
        UUID cal = connect(room, "/f");
        CountDownLatch go = new CountDownLatch(1);
        List<Future<?>> runs = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            runs.add(pool.submit(() -> { go.await(); syncService.sync(cal); return null; }));
        }
        go.countDown();
        for (Future<?> f : runs) f.get(60, TimeUnit.SECONDS);

        assertEquals(1, stub.hits("/f"), "the in-progress guard let only one sync through");
        assertEquals(2, rows(room).size());
        assertEquals(2, eventCount(cal));
    }

    @Test
    void twoManualSyncRequestsAtOnceBothAnswer200ButOnlyOneFetches() throws Exception {
        Room room = newOwnerRoom();
        slowFeed("/f", calendar(event("m1@booking.com", inDays(10), inDays(12), "A")), 1_500);
        UUID cal = connect(room, "/f");
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Integer>> calls = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            calls.add(pool.submit(() -> {
                go.await();
                return send(post("/api/calendars/" + cal + "/sync"), room.token(), null).andReturn().getResponse().getStatus();
            }));
        }
        go.countDown();
        List<Integer> codes = new ArrayList<>();
        for (Future<Integer> f : calls) codes.add(f.get(60, TimeUnit.SECONDS));

        assertTrue(codes.stream().allMatch(c -> c == 200 || c == 429), codes.toString());
        assertEquals(1, stub.hits("/f"));
        assertEquals(1, rows(room).size());
    }

    /**
     * Deterministic race: an owner's booking for the same nights is written but not yet committed when the sync
     * checks for overlaps. The sync's insert waits on the database exclusion constraint; when the owner's booking
     * commits, the whole sync rolls back and the next sync files a conflict. No double booking at any point.
     */
    @Test
    void aSyncThatLosesTheRaceToAnOwnerBookingRollsBackAndThenFilesAConflict() throws Exception {
        Room room = newOwnerRoom();
        LocalDate in = inDays(10), out = inDays(13);
        stub.serve("/f", calendar(event("race@booking.com", in, out, "Booking Guest")));
        UUID cal = connect(room, "/f");

        CountDownLatch written = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        AtomicReference<UUID> directId = new AtomicReference<>();
        Future<?> owner = pool.submit(() -> new TransactionTemplate(txManager).executeWithoutResult(tx -> {
            Unit unit = units.findById(room.unitId()).orElseThrow();
            Reservation r = new Reservation();
            r.setUnit(unit);
            r.setOwnerId(unit.getOwnerId());
            r.setStayRange(Range.closedOpen(in, out));
            r.setStatus(ReservationStatus.CONFIRMED);
            r.setSource(ReservationSource.DIRECT);
            r.setGuestName("Walk-in");
            r.setGuestsCount(2);
            directId.set(reservations.saveAndFlush(r).getId());
            written.countDown();
            try { commit.await(30, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }));
        assertTrue(written.await(30, TimeUnit.SECONDS));

        Future<?> sync = pool.submit(() -> syncService.sync(cal));
        assertTrue(waitForALockWait(), "the sync's insert should be waiting on the owner's uncommitted booking");
        commit.countDown();
        owner.get(30, TimeUnit.SECONDS);
        sync.get(60, TimeUnit.SECONDS);

        List<Map<String, Object>> active = activeRows(room);
        assertEquals(1, active.size(), active::toString);
        assertEquals(directId.get(), active.getFirst().get("id"));
        assertEquals(SAVE_FAILED, calendarRow(cal).getLastError());
        assertEquals(1, calendarRow(cal).getConsecutiveFailures());
        assertEquals(0, eventCount(cal), "the whole reconcile rolled back");

        syncService.sync(cal);
        assertNull(calendarRow(cal).getLastError());
        assertEquals(1, activeRows(room).size());
        send(get("/api/conflicts"), room.token(), null)
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].kind").value("NEW_OVERLAP"))
                .andExpect(jsonPath("$[0].conflictingReservationId").value(directId.get().toString()));
    }

    /** The other order: an import for the nights is in flight (uncommitted) when the owner saves a booking. */
    @Test
    void anOwnerBookingThatLosesTheRaceToAnImportGets409NotA500() throws Exception {
        Room room = newOwnerRoom();
        LocalDate in = inDays(10), out = inDays(13);
        CountDownLatch written = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        Future<?> importer = pool.submit(() -> new TransactionTemplate(txManager).executeWithoutResult(tx -> {
            Unit unit = units.findById(room.unitId()).orElseThrow();
            Reservation r = new Reservation();
            r.setUnit(unit);
            r.setOwnerId(unit.getOwnerId());
            r.setStayRange(Range.closedOpen(in, out));
            r.setStatus(ReservationStatus.CONFIRMED);
            r.setSource(ReservationSource.BOOKING); // what IcalReconciler.createNew writes
            r.setGuestName("CLOSED - Not available");
            r.setGuestsCount(2);
            reservations.saveAndFlush(r);
            written.countDown();
            try { commit.await(30, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        }));
        assertTrue(written.await(30, TimeUnit.SECONDS));

        Future<String> booking = pool.submit(() -> {
            var res = send(post("/api/reservations"), room.token(),
                    reservationJson(room.roomId(), in.toString(), out.toString(), null)).andReturn().getResponse();
            return res.getStatus() + " " + res.getContentAsString();
        });
        assertTrue(waitForALockWait(), "the owner's insert should be waiting on the uncommitted import");
        commit.countDown();
        importer.get(30, TimeUnit.SECONDS);
        String result = booking.get(30, TimeUnit.SECONDS);

        assertTrue(result.startsWith("409 ") && result.contains("DATES_TAKEN"), result);
        assertEquals(1, activeRows(room).size());
        assertEquals("BOOKING", activeRows(room).getFirst().get("source"));
    }

    @Test
    void syncAndOwnerBookingForTheSameNightsNeverDoubleBook() throws Exception {
        Room room = newOwnerRoom();
        List<String> outcomes = new ArrayList<>();
        int rounds = 12;
        // one fresh room per round
        List<String> rooms = roomIds(room.token(), createProperty(room.token(), "Race", rounds));
        assertEquals(rounds, rooms.size());

        for (int i = 0; i < rounds; i++) {
            Room r = new Room(room.owner(), rooms.get(i), room.ownerId());
            LocalDate in = inDays(10 + i), out = inDays(13 + i);
            stub.serve("/f" + i, calendar(event("race" + i + "@booking.com", in, out, "Booking Guest")));
            UUID cal = connect(r, "/f" + i);
            CountDownLatch go = new CountDownLatch(1);
            Future<?> sync = pool.submit(() -> { go.await(); syncService.sync(cal); return null; });
            Future<Integer> book = pool.submit(() -> {
                go.await();
                return send(post("/api/reservations"), r.token(),
                        reservationJson(r.roomId(), in.toString(), out.toString(), null)).andReturn().getResponse().getStatus();
            });
            go.countDown();
            sync.get(60, TimeUnit.SECONDS);
            int code = book.get(60, TimeUnit.SECONDS);
            assertTrue(code == 200 || code == 409, "round " + i + ": HTTP " + code);

            syncService.sync(cal); // settles a lost race into a conflict
            List<Map<String, Object>> active = activeRows(r);
            assertEquals(1, active.size(), "round " + i + ": " + active);
            String winner = (String) active.getFirst().get("source");
            boolean conflictOpen = !conflicts.findAllByExternalCalendarIdAndStatus(cal,
                    com.naumvlavceski.bookingbackend.model.ConflictStatus.OPEN).isEmpty();
            assertEquals("DIRECT".equals(winner), conflictOpen, "round " + i + ": a direct winner must leave a conflict");
            assertEquals(code == 200, "DIRECT".equals(winner), "round " + i);
            outcomes.add(winner + "/" + code);
        }
        Feeds.recordTiming("sync vs owner booking race outcomes: " + outcomes);
    }

    // Finding ICAL-06: a calendar disconnected while its sync is running comes back.
    @Tag("open-finding")
    @Test
    void aCalendarDisconnectedDuringItsSyncStaysDisconnected() throws Exception {
        Room room = newOwnerRoom();
        slowFeed("/f", calendar(event("d1@booking.com", inDays(10), inDays(12), "A")), 2_000);
        UUID cal = connect(room, "/f");
        Future<?> sync = pool.submit(() -> syncService.sync(cal));
        Thread.sleep(500); // the sync is now downloading
        send(delete("/api/calendars/" + cal), room.token(), null).andExpect(status().isNoContent());
        sync.get(60, TimeUnit.SECONDS);

        assertTrue(calendars.findById(cal).isEmpty(),
                "the disconnected calendar was written back by the sync that was running: " + calendars.findById(cal));
    }

    /** Polls Postgres until some backend waits on a lock (the exclusion-constraint wait). */
    private boolean waitForALockWait() throws InterruptedException {
        long deadline = System.currentTimeMillis() + 15_000;
        while (System.currentTimeMillis() < deadline) {
            Integer waiting = jdbc.queryForObject(
                    "select count(*) from pg_stat_activity where wait_event_type = 'Lock' and datname = current_database()",
                    Integer.class);
            if (waiting != null && waiting > 0) return true;
            Thread.sleep(50);
        }
        return false;
    }
}
