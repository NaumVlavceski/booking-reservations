package com.naumvlavceski.bookingbackend.repository;

import com.naumvlavceski.bookingbackend.model.Reservation;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Read-only queries for the invoices (earnings) overview. Native queries bypass the Hibernate ownerFilter,
 * so every query filters by owner explicitly.
 *
 * A reservation qualifies when its status is CONFIRMED or PAID (the "r.status IN" condition is repeated in
 * each query, keep the copies identical). The optional status/source filters narrow that further (never widen it).
 * The optional from/to bounds are inclusive and apply to the
 * check-in date, lower(stay_range).
 */
public interface InvoiceRepository extends JpaRepository<Reservation, UUID> {

    interface PropertyRow {
        UUID getPropertyId();
        String getPropertyName();
        Long getUnitCount();
    }

    interface UnitTotalsRow {
        UUID getUnitId();
        String getUnitName();
        Long getTotalDays();
        BigDecimal getEarnings();
        Long getReservationCount();
        Long getReservationsWithoutAmount();
    }

    interface MissingAmountRow {
        UUID getReservationId();
        UUID getUnitId();
        String getUnitName();
        String getGuestName();
        LocalDate getCheckIn();
        LocalDate getCheckOut();
        Integer getNights();
        String getStatus();
        String getSource();
    }

    interface ReservationRow {
        UUID getReservationId();
        String getGuestName();
        LocalDate getCheckIn();
        LocalDate getCheckOut();
        Integer getNights();
        String getStatus();
        String getSource();
        BigDecimal getTotalAmount();
    }

    @Query(value = """
            SELECT p.id AS "propertyId", p.name AS "propertyName", COUNT(u.id)::bigint AS "unitCount"
            FROM property p
            LEFT JOIN unit u ON u.property_id = p.id AND u.owner_id = p.owner_id
            WHERE p.owner_id = :ownerId
            GROUP BY p.id, p.name
            ORDER BY p.name, p.id
            """, nativeQuery = true)
    List<PropertyRow> propertiesWithUnitCount(@Param("ownerId") UUID ownerId);

    /**
     * One row per unit of the property (optionally just one unit), zeros for units without qualifying
     * reservations. A null total_amount counts as 0 and is reported in reservationsWithoutAmount.
     */
    @Query(value = """
            SELECT u.id   AS "unitId",
                   u.name AS "unitName",
                   COALESCE(SUM(upper(r.stay_range) - lower(r.stay_range)), 0)::bigint AS "totalDays",
                   COALESCE(SUM(COALESCE(r.total_amount, 0)), 0)::numeric              AS "earnings",
                   COUNT(r.id)::bigint                                                 AS "reservationCount",
                   (COUNT(r.id) FILTER (WHERE r.total_amount IS NULL))::bigint         AS "reservationsWithoutAmount"
            FROM unit u
            LEFT JOIN reservation r
                   ON r.unit_id = u.id
                  AND r.owner_id = u.owner_id
                  AND r.status IN ('CONFIRMED', 'PAID')
                  AND (CAST(:from AS date) IS NULL OR lower(r.stay_range) >= CAST(:from AS date))
                  AND (CAST(:to AS date) IS NULL OR lower(r.stay_range) <= CAST(:to AS date))
                  AND (CAST(:status AS text) IS NULL OR r.status = CAST(:status AS text))
                  AND (CAST(:source AS text) IS NULL OR r.source = CAST(:source AS text))
            WHERE u.owner_id = :ownerId
              AND u.property_id = :propertyId
              AND (CAST(:unitId AS uuid) IS NULL OR u.id = CAST(:unitId AS uuid))
            GROUP BY u.id, u.name
            ORDER BY u.name, u.id
            """, nativeQuery = true)
    List<UnitTotalsRow> unitTotals(@Param("ownerId") UUID ownerId,
                                   @Param("propertyId") UUID propertyId,
                                   @Param("unitId") String unitId,
                                   @Param("from") LocalDate from,
                                   @Param("to") LocalDate to,
                                   @Param("status") String status,
                                   @Param("source") String source);

    @Query(value = """
            SELECT r.id                                             AS "reservationId",
                   r.guest_name                                     AS "guestName",
                   lower(r.stay_range)                              AS "checkIn",
                   upper(r.stay_range)                              AS "checkOut",
                   (upper(r.stay_range) - lower(r.stay_range))::int AS "nights",
                   r.status                                         AS "status",
                   r.source                                         AS "source",
                   r.total_amount                                   AS "totalAmount"
            FROM reservation r
            WHERE r.owner_id = :ownerId
              AND r.unit_id = :unitId
              AND r.status IN ('CONFIRMED', 'PAID')
              AND (CAST(:from AS date) IS NULL OR lower(r.stay_range) >= CAST(:from AS date))
              AND (CAST(:to AS date) IS NULL OR lower(r.stay_range) <= CAST(:to AS date))
              AND (CAST(:status AS text) IS NULL OR r.status = CAST(:status AS text))
              AND (CAST(:source AS text) IS NULL OR r.source = CAST(:source AS text))
            ORDER BY lower(r.stay_range) DESC, r.id
            """,
            countQuery = """
            SELECT count(*)
            FROM reservation r
            WHERE r.owner_id = :ownerId
              AND r.unit_id = :unitId
              AND r.status IN ('CONFIRMED', 'PAID')
              AND (CAST(:from AS date) IS NULL OR lower(r.stay_range) >= CAST(:from AS date))
              AND (CAST(:to AS date) IS NULL OR lower(r.stay_range) <= CAST(:to AS date))
              AND (CAST(:status AS text) IS NULL OR r.status = CAST(:status AS text))
              AND (CAST(:source AS text) IS NULL OR r.source = CAST(:source AS text))
            """,
            nativeQuery = true)
    Page<ReservationRow> unitReservations(@Param("ownerId") UUID ownerId,
                                          @Param("unitId") UUID unitId,
                                          @Param("from") LocalDate from,
                                          @Param("to") LocalDate to,
                                          @Param("status") String status,
                                          @Param("source") String source,
                                          Pageable pageable);

    /**
     * The qualifying reservations of a property (optionally one unit) that have no total_amount: the ones that
     * count as 0 in the earnings, listed so the owner can fill them in. Latest check-in first.
     */
    @Query(value = """
            SELECT r.id                                             AS "reservationId",
                   u.id                                             AS "unitId",
                   u.name                                           AS "unitName",
                   r.guest_name                                     AS "guestName",
                   lower(r.stay_range)                              AS "checkIn",
                   upper(r.stay_range)                              AS "checkOut",
                   (upper(r.stay_range) - lower(r.stay_range))::int AS "nights",
                   r.status                                         AS "status",
                   r.source                                         AS "source"
            FROM unit u
            JOIN reservation r ON r.unit_id = u.id AND r.owner_id = u.owner_id
            WHERE u.owner_id = :ownerId
              AND u.property_id = :propertyId
              AND (CAST(:unitId AS uuid) IS NULL OR u.id = CAST(:unitId AS uuid))
              AND r.total_amount IS NULL
              AND r.status IN ('CONFIRMED', 'PAID')
              AND (CAST(:from AS date) IS NULL OR lower(r.stay_range) >= CAST(:from AS date))
              AND (CAST(:to AS date) IS NULL OR lower(r.stay_range) <= CAST(:to AS date))
              AND (CAST(:status AS text) IS NULL OR r.status = CAST(:status AS text))
              AND (CAST(:source AS text) IS NULL OR r.source = CAST(:source AS text))
            ORDER BY lower(r.stay_range) DESC, u.name, r.id
            """,
            countQuery = """
            SELECT count(*)
            FROM unit u
            JOIN reservation r ON r.unit_id = u.id AND r.owner_id = u.owner_id
            WHERE u.owner_id = :ownerId
              AND u.property_id = :propertyId
              AND (CAST(:unitId AS uuid) IS NULL OR u.id = CAST(:unitId AS uuid))
              AND r.total_amount IS NULL
              AND r.status IN ('CONFIRMED', 'PAID')
              AND (CAST(:from AS date) IS NULL OR lower(r.stay_range) >= CAST(:from AS date))
              AND (CAST(:to AS date) IS NULL OR lower(r.stay_range) <= CAST(:to AS date))
              AND (CAST(:status AS text) IS NULL OR r.status = CAST(:status AS text))
              AND (CAST(:source AS text) IS NULL OR r.source = CAST(:source AS text))
            """,
            nativeQuery = true)
    Page<MissingAmountRow> missingAmounts(@Param("ownerId") UUID ownerId,
                                          @Param("propertyId") UUID propertyId,
                                          @Param("unitId") String unitId,
                                          @Param("from") LocalDate from,
                                          @Param("to") LocalDate to,
                                          @Param("status") String status,
                                          @Param("source") String source,
                                          Pageable pageable);
}
