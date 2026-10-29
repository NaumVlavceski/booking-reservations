package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.dto.PageResponse;
import com.naumvlavceski.bookingbackend.dto.ReservationResponse;
import com.naumvlavceski.bookingbackend.model.*;
import com.naumvlavceski.bookingbackend.repository.OwnerRepository;
import com.naumvlavceski.bookingbackend.repository.PropertyRepository;
import com.naumvlavceski.bookingbackend.repository.ReservationRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import io.hypersistence.utils.hibernate.type.range.Range;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** The paged "Cancelled bookings" list, against the real schema. Each test rolls back. */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class CancelledListTest {

    @Autowired ReservationService service;
    @Autowired OwnerRepository ownerRepository;
    @Autowired PropertyRepository propertyRepository;
    @Autowired UnitRepository unitRepository;
    @Autowired ReservationRepository reservationRepository;

    Owner owner;
    Unit unit;

    private Unit newUnit(Owner o) {
        Property p = new Property();
        p.setOwner(o);
        p.setName("Villa");
        p = propertyRepository.save(p);
        Unit u = new Unit();
        u.setOwnerId(o.getId());
        u.setProperty(p);
        u.setName("Room");
        u.setCapacity(2);
        return unitRepository.save(u);
    }

    @BeforeEach
    void setUp() {
        owner = new Owner();
        owner = ownerRepository.save(owner);
        unit = newUnit(owner);
    }

    /** A cancelled booking checking in on {@code checkIn}, cancelled {@code daysAgo} days ago. */
    private Reservation cancelled(Unit u, String guest, String checkIn, int daysAgo) {
        Reservation r = new Reservation();
        r.setUnit(u);
        r.setOwnerId(u.getOwnerId());
        LocalDate in = LocalDate.parse(checkIn);
        r.setStayRange(Range.closedOpen(in, in.plusDays(2)));
        r.setGuestName(guest);
        r.setGuestsCount(2);
        r.setStatus(ReservationStatus.CANCELLED);
        r.setCancelledAt(OffsetDateTime.now().minusDays(daysAgo));
        return reservationRepository.save(r);
    }

    private List<String> names(PageResponse<ReservationResponse> page) {
        return page.items().stream().map(ReservationResponse::guestName).toList();
    }

    private PageResponse<ReservationResponse> list(String name, String from, int page, int size) {
        return service.listCancelled(owner.getId(), name, from == null ? null : LocalDate.parse(from), page, size);
    }

    @Test
    void withoutFiltersTheMostRecentlyCancelledComesFirst() {
        cancelled(unit, "Old", "2031-03-01", 30);
        cancelled(unit, "Newest", "2031-01-01", 1);
        cancelled(unit, "Middle", "2031-02-01", 10);

        assertEquals(List.of("Newest", "Middle", "Old"), names(list(null, null, 0, 20)));
    }

    @Test
    void confirmedBookingsAreNotInTheList() {
        cancelled(unit, "Gone", "2031-01-01", 1);
        Reservation kept = new Reservation();
        kept.setUnit(unit);
        kept.setOwnerId(owner.getId());
        kept.setStayRange(Range.closedOpen(LocalDate.parse("2031-05-01"), LocalDate.parse("2031-05-03")));
        kept.setGuestName("Staying");
        kept.setGuestsCount(2);
        reservationRepository.save(kept);

        assertEquals(List.of("Gone"), names(list(null, null, 0, 20)));
    }

    @Test
    void nameFilterIsStartsWithIgnoringCase() {
        cancelled(unit, "Ana Petrova", "2031-01-01", 3);
        cancelled(unit, "ANASTASIA K", "2031-01-05", 2);
        cancelled(unit, "Mariana", "2031-01-09", 1);
        cancelled(unit, "Boris", "2031-01-12", 4);

        assertEquals(List.of("ANASTASIA K", "Ana Petrova"), names(list("ana", null, 0, 20)));
        assertEquals(List.of("ANASTASIA K", "Ana Petrova"), names(list("  AnA ", null, 0, 20)));
        assertTrue(names(list("petrova", null, 0, 20)).isEmpty(), "the middle of a name does not match");
    }

    @Test
    void nameFilterTreatsPercentUnderscoreAndBangAsPlainCharacters() {
        cancelled(unit, "50% off", "2031-01-01", 3);
        cancelled(unit, "Zed", "2031-01-05", 2);
        cancelled(unit, "a_b", "2031-01-09", 1);

        assertEquals(List.of("50% off"), names(list("5", null, 0, 20)));
        assertEquals(List.of("50% off"), names(list("50%", null, 0, 20)));
        assertTrue(names(list("%", null, 0, 20)).isEmpty(), "a lone % must not match everything");
        assertEquals(List.of("a_b"), names(list("a_", null, 0, 20)));
        assertTrue(names(list("_", null, 0, 20)).isEmpty());
        assertTrue(names(list("!", null, 0, 20)).isEmpty());
    }

    @Test
    void nameFilterWorksForCyrillicNames() {
        cancelled(unit, "Наум Влавчески", "2031-01-01", 1);
        cancelled(unit, "Борис", "2031-01-05", 2);

        assertEquals(List.of("Наум Влавчески"), names(list("наум", null, 0, 20)));
        assertEquals(List.of("Наум Влавчески"), names(list("НАУМ", null, 0, 20)));
    }

    @Test
    void dateFilterListsStaysCheckingInFromThatDayLatestCheckInFirst() {
        cancelled(unit, "Early", "2031-03-01", 1);
        cancelled(unit, "OnTheDay", "2031-04-15", 5);
        cancelled(unit, "Late", "2031-06-20", 9);
        cancelled(unit, "Middle", "2031-05-10", 2);

        assertEquals(List.of("Late", "Middle", "OnTheDay"), names(list(null, "2031-04-15", 0, 20)));
    }

    @Test
    void nameAndDateFiltersCombine() {
        cancelled(unit, "Ana Early", "2031-03-01", 1);
        cancelled(unit, "Ana Late", "2031-06-01", 2);
        cancelled(unit, "Boris Late", "2031-07-01", 3);

        assertEquals(List.of("Ana Late"), names(list("ana", "2031-05-01", 0, 20)));
    }

    @Test
    void resultsArePagedWithTotals() {
        for (int i = 1; i <= 5; i++) cancelled(unit, "Guest " + i, "2031-01-0" + i, i); // Guest 1 is the newest

        PageResponse<ReservationResponse> first = list(null, null, 0, 2);
        assertEquals(List.of("Guest 1", "Guest 2"), names(first));
        assertEquals(5, first.totalElements());
        assertEquals(3, first.totalPages());
        assertEquals(0, first.page());

        assertEquals(List.of("Guest 3", "Guest 4"), names(list(null, null, 1, 2)));
        assertEquals(List.of("Guest 5"), names(list(null, null, 2, 2)));
        assertTrue(list(null, null, 3, 2).items().isEmpty(), "past the last page is empty, not an error");
    }

    @Test
    void totalsReflectTheFilters() {
        for (int i = 1; i <= 5; i++) cancelled(unit, (i <= 3 ? "Ana " : "Bo ") + i, "2031-01-0" + i, i);

        PageResponse<ReservationResponse> page = list("ana", null, 0, 2);
        assertEquals(3, page.totalElements());
        assertEquals(2, page.totalPages());
    }

    @Test
    void silliPageSizesAreClamped() {
        cancelled(unit, "One", "2031-01-01", 1);
        assertEquals(100, list(null, null, 0, 100000).size());
        assertEquals(1, list(null, null, 0, 0).size());
        assertEquals(0, list(null, null, -5, 10).page());
    }

    @Test
    void otherOwnersCancelledBookingsAreNeverListed() {
        Owner other = new Owner();
        other = ownerRepository.save(other);
        cancelled(newUnit(other), "Not yours", "2031-01-01", 1);
        cancelled(unit, "Yours", "2031-01-05", 2);

        assertEquals(List.of("Yours"), names(list(null, null, 0, 20)));
        assertEquals(1, list(null, null, 0, 20).totalElements());
    }
}
