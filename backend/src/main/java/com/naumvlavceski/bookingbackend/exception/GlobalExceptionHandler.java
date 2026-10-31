package com.naumvlavceski.bookingbackend.exception;
import com.naumvlavceski.bookingbackend.exception.EmailNotVerifiedException;
import com.naumvlavceski.bookingbackend.exception.TooManyRequestsException;
import com.naumvlavceski.bookingbackend.exception.VerificationException;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.ErrorResponse;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Every error answers with {timestamp, status, error, message, code}. `code` is stable (NOT_FOUND, VALIDATION_FAILED,
 * DATES_TAKEN, RATE_LIMITED, ...) so the frontend picks its wording by code; `message` is a fallback that is safe to show.
 * Wrong credentials (401) deliberately carry no code, so they look the same whatever the account's state.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(NoSuchElementException ex) {
        return build(HttpStatus.NOT_FOUND, ex.getMessage(), "NOT_FOUND");
    }

    /**
     * Our own services throw IllegalArgumentException with a message written for the user. One thrown inside a
     * library (UUID parsing, BCrypt limits, ...) carries internal wording, so it gets a generic message instead.
     */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleBadRequest(IllegalArgumentException ex) {
        StackTraceElement[] trace = ex.getStackTrace();
        boolean ours = trace.length > 0 && trace[0].getClassName().startsWith(OWN_PACKAGE);
        return build(HttpStatus.BAD_REQUEST, ours ? ex.getMessage() : "Invalid request", "BAD_REQUEST");
    }

    private static final String OWN_PACKAGE = "com.naumvlavceski.bookingbackend.";

    @ExceptionHandler(DatesTakenException.class)
    public ResponseEntity<Map<String, Object>> handleDatesTaken(DatesTakenException ex) {
        Map<String, Object> body = body(HttpStatus.CONFLICT, ex.getMessage(), "DATES_TAKEN");
        body.put("room", ex.getRoom());
        body.put("takenFrom", ex.getTakenFrom().toString());
        body.put("takenTo", ex.getTakenTo().toString());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }

    @ExceptionHandler(BadCredentialsException.class)
    public ResponseEntity<Map<String, Object>> handleBadCredentials(BadCredentialsException ex) {
        return build(HttpStatus.UNAUTHORIZED, ex.getMessage());
    }

    @ExceptionHandler(EmailNotVerifiedException.class)
    public ResponseEntity<Map<String, Object>> handleEmailNotVerified(EmailNotVerifiedException ex) {
        Map<String, Object> body = body(HttpStatus.FORBIDDEN, ex.getMessage(), "EMAIL_NOT_VERIFIED");
        body.put("email", ex.getEmail());
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
    }

    // 400 on purpose, never 401/403: the frontend signs people out on those
    @ExceptionHandler(VerificationException.class)
    public ResponseEntity<Map<String, Object>> handleVerification(VerificationException ex) {
        Map<String, Object> body = body(HttpStatus.BAD_REQUEST, ex.getMessage(), ex.getCode());
        return ResponseEntity.badRequest().body(body);
    }

    @ExceptionHandler(TooManyRequestsException.class)
    public ResponseEntity<Map<String, Object>> handleTooManyRequests(TooManyRequestsException ex) {
        Map<String, Object> body = body(HttpStatus.TOO_MANY_REQUESTS, ex.getMessage(), "RATE_LIMITED");
        body.put("retryAfterSeconds", ex.getRetryAfterSeconds());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.getRetryAfterSeconds()))
                .body(body);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> humanize(fe.getField()) + " " + fe.getDefaultMessage())
                .collect(Collectors.joining(", "));
        // One message per field (the first, if a field breaks several rules), so the form can show it next to that field.
        Map<String, String> fieldErrors = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors().forEach(fe ->
                fieldErrors.putIfAbsent(fe.getField(), humanize(fe.getField()) + " " + fe.getDefaultMessage()));
        Map<String, Object> body = body(HttpStatus.BAD_REQUEST, message, "VALIDATION_FAILED");
        body.put("fieldErrors", fieldErrors);
        return ResponseEntity.badRequest().body(body);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadableBody(HttpMessageNotReadableException ex) {
        return build(HttpStatus.BAD_REQUEST, "Malformed or invalid request body", "BAD_REQUEST");
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return build(HttpStatus.BAD_REQUEST, "Invalid value for '" + ex.getName() + "'", "BAD_REQUEST");
    }

    // Spring MVC's own errors (404 unknown route, 405, 415, missing params...) carry their status; keep it.
    @ExceptionHandler({ServletException.class, org.springframework.web.ErrorResponseException.class})
    public ResponseEntity<Map<String, Object>> handleSpringError(Exception e, HttpServletRequest request) {
        if (!(e instanceof ErrorResponse ex)) return handleUnexpected(e, request);
        HttpStatus status = HttpStatus.resolve(ex.getStatusCode().value());
        if (status == null) status = HttpStatus.INTERNAL_SERVER_ERROR;
        String code = status.is5xxServerError() ? "INTERNAL"
                : status == HttpStatus.NOT_FOUND ? "NOT_FOUND"
                : status == HttpStatus.CONFLICT ? "CONFLICT"
                : "BAD_REQUEST";
        return build(status, status.is5xxServerError() ? "Something went wrong" : ex.getBody().getDetail(), code);
    }

    /**
     * Details stay in the server log under an id the client also gets. The log names the route pattern
     * (/api/ical/{token}.ics), never the actual path or query, so feed tokens and search terms don't end up there;
     * PostgreSQL error details with column values are kept out of exception messages by logServerErrorDetail=false.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(Exception ex, HttpServletRequest request) {
        String errorId = UUID.randomUUID().toString();
        Object route = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        log.error("Unhandled error {} on {} {}", errorId, request.getMethod(), route != null ? route : "(no route)", ex);
        Map<String, Object> body = body(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong", "INTERNAL");
        body.put("errorId", errorId);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(body);
    }

    private static String humanize(String field) {
        String words = field.replaceAll("([a-z])([A-Z])", "$1 $2").toLowerCase();
        return Character.toUpperCase(words.charAt(0)) + words.substring(1);
    }

    private ResponseEntity<Map<String, Object>> build(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(body(status, message));
    }

    private ResponseEntity<Map<String, Object>> build(HttpStatus status, String message, String code) {
        return ResponseEntity.status(status).body(body(status, message, code));
    }

    private Map<String, Object> body(HttpStatus status, String message) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", Instant.now().toString());
        body.put("status", status.value());
        body.put("error", status.getReasonPhrase());
        body.put("message", message);
        return body;
    }

    private Map<String, Object> body(HttpStatus status, String message, String code) {
        Map<String, Object> body = body(status, message);
        body.put("code", code);
        return body;
    }
    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<Map<String, Object>> handleConstraintViolation(ConstraintViolationException ex) {
        String constraintName = ex.getConstraintName();

        if ("no_overlap".equals(constraintName)) {
            return build(HttpStatus.CONFLICT, "These dates are no longer available for this room.", "DATES_TAKEN");
        }

        return build(HttpStatus.CONFLICT, "This request conflicts with existing data.", "CONFLICT");
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, Object>> handleDataIntegrityViolation(DataIntegrityViolationException ex) {
        String message = ex.getMostSpecificCause().getMessage();

        if (message != null && message.contains("no_overlap")) {
            return build(HttpStatus.CONFLICT, "These dates are no longer available for this room.", "DATES_TAKEN");
        }

        return build(HttpStatus.CONFLICT, "This request conflicts with existing data.", "CONFLICT");
    }
}