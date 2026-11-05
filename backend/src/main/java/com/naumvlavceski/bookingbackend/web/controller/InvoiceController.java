package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.config.OpenApiConfig;
import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.dto.InvoiceMissingAmountsResponse;
import com.naumvlavceski.bookingbackend.dto.InvoicePropertyResponse;
import com.naumvlavceski.bookingbackend.dto.InvoicePropertyUnitsResponse;
import com.naumvlavceski.bookingbackend.dto.InvoiceUnitReservationsResponse;
import com.naumvlavceski.bookingbackend.model.ReservationSource;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import com.naumvlavceski.bookingbackend.service.InvoiceXlsx;
import com.naumvlavceski.bookingbackend.service.InvoiceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
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

/**
 * Earnings overview ("Invoices" in the app). Only CONFIRMED and PAID bookings count. {@code from}/{@code to} filter on
 * the check-in date, so a stay counts completely or not at all.
 */
@RestController
@RequestMapping("/api/invoices")
@RequiredArgsConstructor
@Tag(name = OpenApiConfig.TAG_EARNINGS)
public class InvoiceController {

    private static final String FROM = "Only stays checking in on or after this date (yyyy-MM-dd)";
    private static final String TO = "Only stays checking in on or before this date (yyyy-MM-dd)";
    private static final String STATUS = "CONFIRMED or PAID (other statuses never count and are refused with 400)";
    private static final String SOURCE = "Only bookings from this channel";

    private final InvoiceService invoiceService;

    @Operation(summary = "Properties with their number of units", description = "The starting list of the overview.")
    @GetMapping("/properties")
    public List<InvoicePropertyResponse> properties(@CurrentUserId UUID ownerId) {
        return invoiceService.properties(ownerId);
    }

    @Operation(summary = "Earnings of a property, per unit",
            description = "Per unit: nights booked, sum of `totalAmount`, number of bookings, and how many have no "
                    + "amount yet (they count as 0, so the earnings may be understated). `grandTotal` adds the units "
                    + "up. `currency` is always null: amounts are stored without a currency.")
    @ApiResponse(responseCode = "200", description = "The overview")
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @GetMapping("/properties/{propertyId}/units")
    public InvoicePropertyUnitsResponse propertyUnits(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID propertyId,
            @Parameter(description = FROM, example = "2026-07-01") @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = TO, example = "2026-07-31") @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(description = STATUS) @RequestParam(required = false) ReservationStatus status,
            @Parameter(description = SOURCE) @RequestParam(required = false) ReservationSource source
    ) {
        return invoiceService.propertyUnits(ownerId, propertyId, from, to, status, source);
    }

    @Operation(summary = "Earnings of one unit, with its bookings (paged)")
    @ApiResponse(responseCode = "200", description = "Totals and one page of bookings")
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @GetMapping("/units/{unitId}/reservations")
    public InvoiceUnitReservationsResponse unitReservations(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID unitId,
            @Parameter(description = FROM, example = "2026-07-01") @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = TO, example = "2026-07-31") @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(description = STATUS) @RequestParam(required = false) ReservationStatus status,
            @Parameter(description = SOURCE) @RequestParam(required = false) ReservationSource source,
            @Parameter(description = "Page number, from 0") @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Page size, 1 to 100") @RequestParam(defaultValue = "20") int size
    ) {
        return invoiceService.unitReservations(ownerId, unitId, from, to, status, source, page, size);
    }

    @Operation(summary = "Bookings without an amount (paged)",
            description = "The counted bookings of a property (or one unit) that have no `totalAmount`, so the owner "
                    + "can fill them in.")
    @ApiResponse(responseCode = "200", description = "One page")
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @GetMapping("/properties/{propertyId}/missing-amounts")
    public InvoiceMissingAmountsResponse missingAmounts(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID propertyId,
            @Parameter(description = "Only this unit of the property") @RequestParam(required = false) UUID unitId,
            @Parameter(description = FROM, example = "2026-07-01") @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = TO, example = "2026-07-31") @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(description = STATUS) @RequestParam(required = false) ReservationStatus status,
            @Parameter(description = SOURCE) @RequestParam(required = false) ReservationSource source,
            @Parameter(description = "Page number, from 0") @RequestParam(defaultValue = "0") int page,
            @Parameter(description = "Page size, 1 to 100") @RequestParam(defaultValue = "20") int size
    ) {
        return invoiceService.missingAmounts(ownerId, propertyId, unitId, from, to, status, source, page, size);
    }

    /** The bookings of a property (or one room) for the chosen filters, as an Excel (.xlsx) download. */
    @Operation(summary = "Download the bookings as Excel (.xlsx)",
            description = "The counted bookings of a property (or one unit) for the same filters, as a file download.")
    @ApiResponse(responseCode = "200", description = "The .xlsx file", content = @Content(
            mediaType = InvoiceXlsx.MEDIA_TYPE, schema = @Schema(type = "string", format = "binary")))
    @ApiResponse(responseCode = "400", ref = OpenApiConfig.BAD_REQUEST)
    @ApiResponse(responseCode = "404", ref = OpenApiConfig.NOT_FOUND)
    @GetMapping("/properties/{propertyId}/export")
    public ResponseEntity<byte[]> exportXlsx(
            @CurrentUserId UUID ownerId,
            @PathVariable UUID propertyId,
            @Parameter(description = "Only this unit of the property") @RequestParam(required = false) UUID unitId,
            @Parameter(description = FROM, example = "2026-07-01") @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @Parameter(description = TO, example = "2026-07-31") @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(description = STATUS) @RequestParam(required = false) ReservationStatus status,
            @Parameter(description = SOURCE) @RequestParam(required = false) ReservationSource source
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
