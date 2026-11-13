package com.naumvlavceski.bookingbackend.audit.business;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Phase 3.3: races. Real threads through the real filter chain and services, released together by a CountDownLatch.
 * The app check (findOverlapping) is check-then-insert with no lock, so under a race both requests can pass it; the
 * exclusion constraint no_overlap then refuses the loser and GlobalExceptionHandler maps that to 409 DATES_TAKEN.
 */
class ConcurrencyTest extends BusinessTestBase {

    private record Result(int status, String body) {}

    /** Runs every call at the same moment and returns the results in call order. */
    private List<Result> race(List<Callable<MockHttpServletResponse>> calls) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(calls.size());
        CountDownLatch ready = new CountDownLatch(calls.size());
        CountDownLatch go = new CountDownLatch(1);
        try {
            List<Future<MockHttpServletResponse>> futures = new ArrayList<>();
            for (Callable<MockHttpServletResponse> call : calls) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await();
                    return call.call();
                }));
            }
            assertTrue(ready.await(30, TimeUnit.SECONDS));
            go.countDown();
            List<Result> out = new ArrayList<>();
            for (Future<MockHttpServletResponse> f : futures) {
                MockHttpServletResponse r = f.get(120, TimeUnit.SECONDS);
                out.add(new Result(r.getStatus(), r.getContentAsString()));
            }
            return out;
        } finally {
            pool.shutdownNow();
        }
    }

    private Callable<MockHttpServletResponse> call(MockHttpServletRequestBuilder req, String token, String json) {
        return () -> send(req, token, json).andReturn().getResponse();
    }

    private static Map<Integer, Integer> histogram(List<Result> results) {
        Map<Integer, Integer> h = new TreeMap<>();
        results.forEach(r -> h.merge(r.status(), 1, Integer::sum));
        return h;
    }

    @Test
    void fiftyParallelBookingsOfTheSameNightsLetExactlyOneWin() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        List<Callable<MockHttpServletResponse>> calls = new ArrayList<>();
        for (int i = 0; i < 50; i++) {
            calls.add(call(post("/api/reservations"), o.token(),
                    reservationJson(room, "2033-07-01", "2033-07-08", "\"guestName\":\"Racer " + i + "\"")));
        }
        List<Result> results = race(calls);
        assertEquals(Map.of(200, 1, 409, 49), histogram(results), results.toString());
        results.stream().filter(r -> r.status() == 409)
                .forEach(r -> assertEquals("DATES_TAKEN", JsonPath.read(r.body(), "$.code"), r.body()));
        assertEquals(1, liveCount(room));
    }

    @Test
    void overlappingButDifferentRangesRacingStillGiveOneWinner() throws Exception {
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        List<Callable<MockHttpServletResponse>> calls = new ArrayList<>();
        for (int i = 0; i < 20; i++) { // every pair shares the night of 15 Aug
            calls.add(call(post("/api/reservations"), o.token(),
                    reservationJson(room, "2033-08-" + (10 + i % 5), "2033-08-" + (16 + i % 3), null)));
        }
        List<Result> results = race(calls);
        assertEquals(Map.of(200, 1, 409, 19), histogram(results), results.toString());
        assertEquals(1, liveCount(room));
    }

    /** Races two moves into one free room {@code rounds} times; returns how many losers got a 500 instead of a 409. */
    private int raceMoves(int rounds, java.time.LocalDate first) throws Exception {
        TestOwner o = newOwner();
        List<String> rooms = roomIds(o.token(), createProperty(o.token(), "Mover", 3));
        int serverErrors = 0;
        for (int round = 0; round < rounds; round++) {
            String in = first.plusDays(round).toString(), out = first.plusDays(round + 1).toString();
            String x = createReservation(o.token(), rooms.get(0), in, out, null);
            String y = createReservation(o.token(), rooms.get(1), in, out, null);
            String target = "{\"unitId\":\"" + rooms.get(2) + "\"}";
            List<Result> results = race(List.of(
                    call(post("/api/reservations/" + x + "/move"), o.token(), target),
                    call(post("/api/reservations/" + y + "/move"), o.token(), target)));
            Map<Integer, Integer> h = histogram(results);
            // never two winners, never a lost booking
            assertEquals(1, h.getOrDefault(200, 0), "round " + round + ": " + results);
            assertTrue(h.keySet().stream().allMatch(s -> s == 200 || s == 409 || s == 500), results.toString());
            serverErrors += h.getOrDefault(500, 0);
        }
        assertEquals(rounds, liveCount(rooms.get(2)));
        assertEquals(2 * rounds, liveCount(rooms.get(0)) + liveCount(rooms.get(1)) + liveCount(rooms.get(2)));
        return serverErrors;
    }

    /**
     * Documents current behaviour behind BIZ-09: the double booking is always prevented, but the losing move sometimes
     * gets a PostgreSQL deadlock (both UPDATEs wait on each other inside the no_overlap check) that is not mapped, so it
     * answers 500 "Something went wrong" instead of 409 DATES_TAKEN.
     */
    @Test
    void twoBookingsMovedIntoTheSameFreeRoomAtOnceNeverDoubleBook() throws Exception {
        int errors = raceMoves(10, java.time.LocalDate.of(2033, 9, 1));
        System.out.println("[audit] concurrent moves: " + errors + " of 10 losers answered 500 (deadlock)");
    }

    // Finding BIZ-09, FIXED (GlobalExceptionHandler.handleLockFailure): the loser of a move race gets 409 DATES_TAKEN,
    // never 500 (the deadlock was not mapped). Regression test.
    @Test
    void theLoserOfAMoveRaceGetsDatesTaken() throws Exception {
        // deadlocks are probabilistic (about 1 race in 10 here), so 40 races: all 40 clean by chance is about 1.5%
        assertEquals(0, raceMoves(40, java.time.LocalDate.of(2038, 1, 1)), "moves answered 500 instead of 409");
    }

    @Test
    void twoCopiesIntoTheSameRoomAtOnceAreAllOrNothing() throws Exception {
        TestOwner o = newOwner();
        List<String> rooms = roomIds(o.token(), createProperty(o.token(), "Copier", 4));
        for (int round = 0; round < 5; round++) {
            String in = "2033-10-" + String.format("%02d", 1 + round * 5), out = "2033-10-" + String.format("%02d", 4 + round * 5);
            String x = createReservation(o.token(), rooms.get(0), in, out, null);
            String y = createReservation(o.token(), rooms.get(1), in, out, null);
            // x copies to rooms 3 and 4, y only to room 4: if y wins, x must leave room 3 untouched too
            List<Result> results = race(List.of(
                    call(post("/api/reservations/" + x + "/copy"), o.token(),
                            "{\"unitIds\":[\"" + rooms.get(2) + "\",\"" + rooms.get(3) + "\"]}"),
                    call(post("/api/reservations/" + y + "/copy"), o.token(), "{\"unitIds\":[\"" + rooms.get(3) + "\"]}")));
            assertEquals(Map.of(200, 1, 409, 1), histogram(results), "round " + round + ": " + results);
            boolean xWon = results.get(0).status() == 200;
            int room3 = jdbc.queryForObject("SELECT count(*) FROM reservation WHERE unit_id = ?::uuid AND status <> 'CANCELLED'"
                    + " AND lower(stay_range) = ?::date", Integer.class, rooms.get(2), in);
            assertEquals(xWon ? 1 : 0, room3, "round " + round + " x won=" + xWon);
        }
    }

    /** One race through PUT; kind = "edit" (two edits), "update-create", or "restore-create". Returns 500s seen. */
    private int racePuts(String kind, int rounds, int year) throws Exception {
        java.time.LocalDate base = java.time.LocalDate.of(year, 1, 1);
        TestOwner o = newOwner();
        String room = newRoom(o.token());
        int serverErrors = 0;
        for (int round = 0; round < rounds; round++) {
            String in = base.plusDays(200 + round).toString(), out = base.plusDays(201 + round).toString();
            String x = createReservation(o.token(), room, base.plusDays(round).toString(),
                    base.plusDays(round + 1).toString(), null);
            Callable<MockHttpServletResponse> first = call(put("/api/reservations/" + x), o.token(), reservationJson(room, in, out, null));
            Callable<MockHttpServletResponse> second;
            switch (kind) {
                case "edit" -> {
                    String y = createReservation(o.token(), room, base.plusDays(100 + round).toString(),
                            base.plusDays(101 + round).toString(), null);
                    second = call(put("/api/reservations/" + y), o.token(), reservationJson(room, in, out, null));
                }
                case "restore-create" -> {
                    String z = createReservation(o.token(), room, in, out, null);
                    send(delete("/api/reservations/" + z), o.token(), null);
                    first = call(put("/api/reservations/" + z), o.token(), reservationJson(room, in, out, "\"status\":\"CONFIRMED\""));
                    second = call(post("/api/reservations"), o.token(), reservationJson(room, in, out, null));
                }
                default -> second = call(post("/api/reservations"), o.token(), reservationJson(room, in, out, null));
            }
            List<Result> results = race(List.of(first, second));
            Map<Integer, Integer> h = histogram(results);
            assertEquals(1, h.getOrDefault(200, 0), kind + " round " + round + ": " + results);
            assertTrue(h.keySet().stream().allMatch(s -> s == 200 || s == 409 || s == 500), results.toString());
            serverErrors += h.getOrDefault(500, 0);
            int onTarget = jdbc.queryForObject("SELECT count(*) FROM reservation WHERE unit_id = ?::uuid AND status <> 'CANCELLED'"
                    + " AND stay_range && daterange(?::date, ?::date, '[)')", Integer.class, room, in, out);
            assertEquals(1, onTarget, kind + " round " + round);
        }
        System.out.println("[audit] concurrent " + kind + ": " + serverErrors + " of " + rounds + " losers answered 500 (deadlock)");
        return serverErrors;
    }

    /** BIZ-09 also applies to PUT: two existing bookings edited onto the same free nights at once. Never double books. */
    @Test
    void twoEditsOntoTheSameNightsNeverDoubleBook() throws Exception {
        racePuts("edit", 10, 2034);
    }

    @Test
    void anUpdateAndACreateRacingForTheSameNightsNeverDoubleBook() throws Exception {
        racePuts("update-create", 10, 2035);
    }

    @Test
    void aRestoreAndACreateRacingForTheSameNightsNeverDoubleBook() throws Exception {
        racePuts("restore-create", 10, 2036);
    }

    // Finding BIZ-09: in any race involving PUT (edit vs edit, edit vs create, restore vs create) the loser must get
    // 409 DATES_TAKEN, never 500. Deadlocks are probabilistic (about 1 race in 10 here), so 60 races in total.
    // FIXED (GlobalExceptionHandler.handleLockFailure): regression test.
    @Test
    void theLoserOfAnEditRaceGetsDatesTaken() throws Exception {
        int errors = racePuts("edit", 20, 2037) + racePuts("update-create", 20, 2039) + racePuts("restore-create", 20, 2041);
        assertEquals(0, errors, "PUT races answered 500 instead of 409");
    }
}
