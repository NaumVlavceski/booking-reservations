package com.naumvlavceski.bookingbackend.web.controller;

import com.naumvlavceski.bookingbackend.ical.ICalBuilder;
import com.naumvlavceski.bookingbackend.model.Reservation;
import com.naumvlavceski.bookingbackend.model.ReservationStatus;
import com.naumvlavceski.bookingbackend.model.Unit;
import com.naumvlavceski.bookingbackend.repository.ReservationRepository;
import com.naumvlavceski.bookingbackend.repository.UnitRepository;
import com.naumvlavceski.bookingbackend.service.ReservationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/ical")
@RequiredArgsConstructor
public class ICalExportController {
    private final UnitRepository unitRepository;
    private final ReservationRepository reservationRepository;

    @GetMapping(value = "/{token}.ics", produces = "text/calendar")
    public ResponseEntity<String> exportFeed(@PathVariable String token) {
        System.out.println("token: " + token);
        Unit unit = unitRepository.findByIcalToken(token).orElseThrow(() -> new NoSuchElementException("Feed not found"));
        List<Reservation> reservations = reservationRepository
                .findAllByUnitIdAndStatusNot(unit.getId(), ReservationStatus.CANCELLED);
        String ics = ICalBuilder.build(unit, reservations);
        return ResponseEntity.ok()
                .header("Cache-Control", "max-age=1800")
                .body(ics);

    }
}
