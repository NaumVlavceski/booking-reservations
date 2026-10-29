package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.dto.InvoiceMissingAmountsResponse;
import com.naumvlavceski.bookingbackend.dto.InvoicePropertyResponse;
import com.naumvlavceski.bookingbackend.dto.InvoicePropertyUnitsResponse;
import com.naumvlavceski.bookingbackend.dto.InvoiceUnitReservationsResponse;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import com.naumvlavceski.bookingbackend.service.InvoiceXlsx;
import com.naumvlavceski.bookingbackend.service.InvoiceService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/invoices")
@RequiredArgsConstructor
public class InvoiceController {

    private final InvoiceService invoiceService;

    @GetMapping("/properties")
    public List<InvoicePropertyResponse> properties(@CurrentUserId UUID ownerId) {
        return invoiceService.properties(ownerId);
    }

    @GetMapping("/properties/{propertyId}/units")
    public InvoicePropertyUnitsResponse propertyUnits(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) ReservationStatus status,
            @RequestParam(required = false) ReservationSource source
    ) {
        return invoiceService.propertyUnits(ownerId, propertyId, from, to, status, source);
    }

    @GetMapping("/units/{unitId}/reservations")
    public InvoiceUnitReservationsResponse unitReservations(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID unitId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) ReservationStatus status,
            @RequestParam(required = false) ReservationSource source,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return invoiceService.unitReservations(ownerId, unitId, from, to, status, source, page, size);
    }

    @GetMapping("/properties/{propertyId}/missing-amounts")
    public InvoiceMissingAmountsResponse missingAmounts(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) UUID unitId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) ReservationStatus status,
            @RequestParam(required = false) ReservationSource source,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size
    ) {
        return invoiceService.missingAmounts(ownerId, propertyId, unitId, from, to, status, source, page, size);
    }

    /** The bookings of a property (or one room) for the chosen filters, as an Excel (.xlsx) download. */
    @GetMapping("/properties/{propertyId}/export")
    public ResponseEntity<byte[]> exportXlsx(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID propertyId,
            @RequestParam(required = false) UUID unitId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) ReservationStatus status,
            @RequestParam(required = false) ReservationSource source
    ) {
        InvoiceXlsx.Export export = invoiceService.exportXlsx(ownerId, propertyId, unitId, from, to, status, source);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(InvoiceXlsx.MEDIA_TYPE))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(export.filename()).build().toString())
                .cacheControl(CacheControl.noStore())
                .body(export.content());
    }
}
