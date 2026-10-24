package com.naumvlavceski.bookingbackend.service;

import com.naumvlavceski.bookingbackend.dto.InvoiceMissingAmountsResponse;
import com.naumvlavceski.bookingbackend.dto.InvoicePropertyResponse;
import com.naumvlavceski.bookingbackend.dto.InvoicePropertyUnitsResponse;
import com.naumvlavceski.bookingbackend.dto.InvoicePropertyUnitsResponse.Totals;
import com.naumvlavceski.bookingbackend.dto.InvoicePropertyUnitsResponse.UnitEarnings;
import com.naumvlavceski.bookingbackend.dto.InvoiceUnitReservationsResponse;
import com.naumvlavceski.bookingbackend.model.Property;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import com.naumvlavceski.bookingbackend.model.Unit;
import com.naumvlavceski.bookingbackend.repository.InvoiceRepository;
import com.naumvlavceski.bookingbackend.repository.InvoiceRepository.UnitTotalsRow;
import com.naumvlavceski.bookingbackend.repository.PropertyRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import com.naumvlavceski.bookingbackend.dto.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Earnings overview. Only CONFIRMED and PAID reservations count; everything else (CANCELLED, BLOCK) is ignored.
 *
 *  - totalDays = the sum of nights (check_out - check_in) of the qualifying reservations. Not clipped to
 *    from/to: from/to filter on the check-in date, so a stay counts completely or not at all.
 *  - earnings = the sum of total_amount of the qualifying reservations. A null total_amount counts as 0 and is
 *    reported in reservationsWithoutAmount so the UI can warn that earnings may be understated.
 *  - Optional status (CONFIRMED or PAID) and source filters narrow the set further; all totals follow them.
 *  - Sums are computed in SQL per unit; the property grand total adds up those unit rows.
 *  - Currency is not part of the data model yet, so it is always null.
 */
@Service
@RequiredArgsConstructor
public class InvoiceService {

    private static final int MAX_PAGE_SIZE = 100;

    private final InvoiceRepository invoiceRepository;
    private final PropertyRepository propertyRepository;
    private final UnitRepository unitRepository;

    @Transactional(readOnly = true)
    public List<InvoicePropertyResponse> properties(UUID ownerId) {
        return invoiceRepository.propertiesWithUnitCount(ownerId).stream()
                .map(p -> new InvoicePropertyResponse(p.getPropertyId(), p.getPropertyName(), p.getUnitCount()))
                .toList();
    }

    @Transactional(readOnly = true)
    public InvoicePropertyUnitsResponse propertyUnits(UUID ownerId, UUID propertyId, LocalDate from, LocalDate to,
                                                     ReservationStatus status, ReservationSource source) {
        checkRange(from, to);
        checkStatus(status);
        Property property = propertyRepository.findByIdAndOwnerId(propertyId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Property not found"));

        List<UnitEarnings> units = invoiceRepository.unitTotals(ownerId, property.getId(), null, from, to, name(status), name(source)).stream()
                .map(this::toUnitEarnings)
                .toList();

        long days = 0, count = 0, withoutAmount = 0;
        BigDecimal earnings = BigDecimal.ZERO;
        for (UnitEarnings u : units) {
            days += u.totalDays();
            count += u.reservationCount();
            withoutAmount += u.reservationsWithoutAmount();
            earnings = earnings.add(u.earnings());
        }
        return new InvoicePropertyUnitsResponse(property.getId(), property.getName(), units,
                new Totals(days, money(earnings), count, withoutAmount), null);
    }

    @Transactional(readOnly = true)
    public InvoiceUnitReservationsResponse unitReservations(UUID ownerId, UUID unitId, LocalDate from, LocalDate to,
                                                            ReservationStatus status, ReservationSource source,
                                                            int page, int size) {
        checkRange(from, to);
        checkStatus(status);
        Unit unit = unitRepository.findByIdAndOwnerId(unitId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Room not found"));

        UnitEarnings totals = invoiceRepository
                .unitTotals(ownerId, unit.getProperty().getId(), unit.getId().toString(), from, to,
                        name(status), name(source)).stream()
                .findFirst().map(this::toUnitEarnings)
                .orElseThrow(() -> new NoSuchElementException("Room not found"));

        // Only the list is paged; the totals above cover every matching booking.
        Page<InvoiceUnitReservationsResponse.Item> items = invoiceRepository
                .unitReservations(ownerId, unit.getId(), from, to, name(status), name(source), pageable(page, size))
                .map(r -> new InvoiceUnitReservationsResponse.Item(r.getReservationId(), r.getGuestName(),
                        r.getCheckIn(), r.getCheckOut(), r.getNights(),
                        ReservationStatus.valueOf(r.getStatus()), ReservationSource.valueOf(r.getSource()),
                        r.getTotalAmount() == null ? null : money(r.getTotalAmount())));

        return new InvoiceUnitReservationsResponse(unit.getId(), unit.getName(), unit.getProperty().getId(),
                unit.getProperty().getName(), totals.totalDays(), totals.earnings(), totals.reservationCount(),
                totals.reservationsWithoutAmount(), null, toPage(items));
    }

    /**
     * The bookings that have no total_amount (and therefore count as 0 in the earnings) for a property, or for one
     * of its rooms when unitId is given. Same filters as the other screens, so the list matches their warning count.
     */
    @Transactional(readOnly = true)
    public InvoiceMissingAmountsResponse missingAmounts(UUID ownerId, UUID propertyId, UUID unitId, LocalDate from,
                                                        LocalDate to, ReservationStatus status, ReservationSource source,
                                                        int page, int size) {
        checkRange(from, to);
        checkStatus(status);
        Property property = propertyRepository.findByIdAndOwnerId(propertyId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Property not found"));
        Unit unit = null;
        if (unitId != null) {
            unit = unitRepository.findByIdAndOwnerId(unitId, ownerId)
                    .filter(u -> u.getProperty().getId().equals(property.getId()))
                    .orElseThrow(() -> new NoSuchElementException("Room not found"));
        }

        Page<InvoiceMissingAmountsResponse.Item> items = invoiceRepository
                .missingAmounts(ownerId, property.getId(), unit == null ? null : unit.getId().toString(),
                        from, to, name(status), name(source), pageable(page, size))
                .map(r -> new InvoiceMissingAmountsResponse.Item(r.getReservationId(), r.getUnitId(), r.getUnitName(),
                        r.getGuestName(), r.getCheckIn(), r.getCheckOut(), r.getNights(),
                        ReservationStatus.valueOf(r.getStatus()), ReservationSource.valueOf(r.getSource())));

        return new InvoiceMissingAmountsResponse(property.getId(), property.getName(),
                unit == null ? null : unit.getId(), unit == null ? null : unit.getName(), toPage(items));
    }

    /**
     * Every booking behind the totals of a property (or one of its rooms when unitId is given) as an Excel file, with
     * the same filters as the screens, so the file adds up to what they show. Not paged.
     */
    @Transactional(readOnly = true)
    public InvoiceXlsx.Export exportXlsx(UUID ownerId, UUID propertyId, UUID unitId, LocalDate from, LocalDate to,
                                         ReservationStatus status, ReservationSource source) {
        checkRange(from, to);
        checkStatus(status);
        Property property = propertyRepository.findByIdAndOwnerId(propertyId, ownerId)
                .orElseThrow(() -> new NoSuchElementException("Property not found"));
        if (unitId != null) {
            unitRepository.findByIdAndOwnerId(unitId, ownerId)
                    .filter(u -> u.getProperty().getId().equals(property.getId()))
                    .orElseThrow(() -> new NoSuchElementException("Room not found"));
        }

        List<InvoiceRepository.ExportRow> rows = invoiceRepository.exportRows(ownerId, property.getId(),
                unitId == null ? null : unitId.toString(), from, to, name(status), name(source));
        return new InvoiceXlsx.Export(InvoiceXlsx.filename(from, to), InvoiceXlsx.write(property.getName(), rows));
    }


    private static Pageable pageable(int page, int size) {
        return PageRequest.of(Math.max(page, 0), Math.min(Math.max(size, 1), MAX_PAGE_SIZE));
    }

    private static <T> PageResponse<T> toPage(Page<T> page) {
        return new PageResponse<>(page.getContent(), page.getNumber(), page.getSize(),
                page.getTotalElements(), page.getTotalPages());
    }

    private UnitEarnings toUnitEarnings(UnitTotalsRow r) {
        return new UnitEarnings(r.getUnitId(), r.getUnitName(), r.getTotalDays(), money(r.getEarnings()),
                r.getReservationCount(), r.getReservationsWithoutAmount());
    }

    /** Only CONFIRMED and PAID are invoiced; asking for another status is a mistake, not "everything". */
    private static void checkStatus(ReservationStatus status) {
        if (status != null && status != ReservationStatus.CONFIRMED && status != ReservationStatus.PAID) {
            throw new IllegalArgumentException("Only CONFIRMED and PAID bookings are invoiced");
        }
    }

    private static String name(Enum<?> value) {
        return value == null ? null : value.name();
    }

    private static void checkRange(LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new IllegalArgumentException("'from' must not be after 'to'");
        }
    }

    private static BigDecimal money(BigDecimal v) {
        return (v == null ? BigDecimal.ZERO : v).setScale(2, RoundingMode.HALF_UP);
    }
}
