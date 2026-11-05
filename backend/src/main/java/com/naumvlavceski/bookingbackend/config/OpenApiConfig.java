package com.naumvlavceski.bookingbackend.config;

import com.naumvlavceski.bookingbackend.config.openapi.ApiErrorSchema;
import com.naumvlavceski.bookingbackend.config.security.CurrentUserId;
import com.naumvlavceski.bookingbackend.demo.DemoAccounts;
import io.swagger.v3.core.converter.ModelConverters;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.examples.Example;
import io.swagger.v3.oas.models.headers.Header;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.Content;
import io.swagger.v3.oas.models.media.IntegerSchema;
import io.swagger.v3.oas.models.media.MediaType;
import io.swagger.v3.oas.models.media.Schema;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import io.swagger.v3.oas.models.tags.Tag;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.utils.SpringDocUtils;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The public API description (Swagger UI at /swagger-ui/index.html, spec at /v3/api-docs). Only served when
 * app.docs.enabled is true. Documentation only: nothing here changes what the API does or who may call it.
 * Error responses are described once under components/responses and referenced from the operations.
 */
@Configuration
public class OpenApiConfig {

    public static final String BEARER = "bearerAuth";

    public static final String TAG_AUTH = "Auth";
    public static final String TAG_PROPERTIES = "Properties";
    public static final String TAG_UNITS = "Units";
    public static final String TAG_RESERVATIONS = "Reservations";
    public static final String TAG_CALENDAR_SYNC = "Calendar sync";
    public static final String TAG_EARNINGS = "Earnings";
    public static final String TAG_ACCOUNT = "Account and privacy";

    public static final String BAD_REQUEST = "#/components/responses/BadRequest";
    public static final String UNAUTHORIZED = "#/components/responses/Unauthorized";
    public static final String FORBIDDEN = "#/components/responses/Forbidden";
    public static final String NOT_FOUND = "#/components/responses/NotFound";
    public static final String DATES_TAKEN = "#/components/responses/DatesTaken";
    public static final String TOO_MANY_REQUESTS = "#/components/responses/TooManyRequests";

    private static final String ERROR_SCHEMA = "#/components/schemas/" + ApiErrorSchema.NAME;
    /** Paths anyone may call (SecurityConfig permitAll); every other operation needs the bearer token. */
    private static final String PUBLIC_PREFIX = "/api/auth/";

    static {
        // The owner id comes from the token (CurrentUserIdArgumentResolver), never from the request
        SpringDocUtils.getConfig().addAnnotationsToIgnore(CurrentUserId.class);
    }

    @Bean
    public OpenAPI roomTrackOpenApi(@Value("${app.docs.server-url:}") String serverUrl,
                                    @Value("${app.demo.enabled:false}") boolean demoEnabled,
                                    @Value("${app.demo.lifetime:1h}") Duration demoLifetime) {
        OpenAPI api = new OpenAPI()
                .info(new Info()
                        .title("RoomTrack API")
                        .version("0.0.1")
                        .description(description(demoEnabled, demoLifetime))
                        .contact(new Contact().name("RoomTrack").url("https://roomtrack.app")))
                .tags(List.of(
                        new Tag().name(TAG_AUTH).description("Sign up, email verification, sign in and password reset. No token needed."),
                        new Tag().name(TAG_PROPERTIES).description("Properties (a house or an apartment building) of the signed-in owner."),
                        new Tag().name(TAG_UNITS).description("Units, called rooms in the app: what a reservation is booked into. Each has its own calendar feed."),
                        new Tag().name(TAG_RESERVATIONS).description("Bookings of a unit. Overlapping live bookings of one unit are refused with 409 (see the API description)."),
                        new Tag().name(TAG_CALENDAR_SYNC).description("Booking.com calendar links that are imported every 10 minutes, their health, and the booking conflicts the import finds."),
                        new Tag().name(TAG_EARNINGS).description("Earnings overview per property, unit and booking, with an Excel export. Only CONFIRMED and PAID bookings count."),
                        new Tag().name(TAG_ACCOUNT).description("The signed-in account: profile, password, notification settings, data export and account deletion.")))
                .components(new Components()
                        .addSecuritySchemes(BEARER, new SecurityScheme()
                                .type(SecurityScheme.Type.HTTP)
                                .scheme("bearer")
                                .bearerFormat("JWT")
                                .description("The `token` from POST /api/auth/login. Paste it without the word Bearer.")));
        if (serverUrl != null && !serverUrl.isBlank()) {
            api.servers(List.of(new Server().url(serverUrl.trim()).description("RoomTrack API")));
        }
        return api;
    }

    /** Adds the shared error responses, and the bearer requirement plus 401 to every operation that needs a token. */
    @Bean
    public OpenApiCustomizer roomTrackErrorsAndSecurity() {
        return api -> {
            Components components = api.getComponents();
            ModelConverters.getInstance().read(ApiErrorSchema.class).forEach(components::addSchemas);
            components.addResponses("BadRequest", error("Invalid input. `fieldErrors` names each invalid field.", Map.of(
                    "validation", example("A required field is missing", 400, "Bad Request",
                            "Check out must not be null", "VALIDATION_FAILED",
                            Map.of("fieldErrors", Map.of("checkOut", "Check out must not be null"))),
                    "rule", example("A rule of the service was broken", 400, "Bad Request",
                            "Check-out must be after check-in", "BAD_REQUEST", Map.of()))));
            components.addResponses("Unauthorized", new ApiResponse().description(
                    "No token, or the token is invalid, expired or was ended (password change, account deleted). "
                            + "Sign in again with POST /api/auth/login."));
            components.addResponses("Forbidden", error("Not allowed for this account.", Map.of(
                    "emailNotVerified", example("The email address is not verified yet", 403, "Forbidden",
                            "Please verify your email address to log in.", "EMAIL_NOT_VERIFIED",
                            Map.of("email", "owner@example.com")),
                    "demo", example("Turned off in a demo", 403, "Forbidden",
                            "This is turned off in the demo account.", "DEMO_RESTRICTED", Map.of()))));
            components.addResponses("NotFound", error(
                    "Not found. An id that belongs to another owner gets exactly the same answer as an unknown id.",
                    Map.of("notFound", example("Unknown or someone else's id", 404, "Not Found",
                            "Reservation not found", "NOT_FOUND", Map.of()))));
            components.addResponses("DatesTaken", error(
                    "The unit already has a live booking (not CANCELLED) on some of these nights. Stays are half-open "
                            + "[check-in, check-out), so a stay may start on the day another one ends. The service checks "
                            + "first and names the colliding booking; if two requests race, the PostgreSQL exclusion "
                            + "constraint `no_overlap` refuses the second one and the answer has no room or dates.",
                    Map.of(
                            "datesTaken", example("Found by the check before saving", 409, "Conflict",
                                    "Room 2 is already booked on some of these dates.", "DATES_TAKEN",
                                    Map.of("room", "Room 2", "takenFrom", "2026-07-10", "takenTo", "2026-07-14")),
                            "raceLost", example("Refused by the database constraint (simultaneous requests)", 409,
                                    "Conflict", "These dates are no longer available for this room.", "DATES_TAKEN",
                                    Map.of()))));
            ApiResponse tooMany = error("Rate limit reached. Wait the number of seconds in `Retry-After` (also "
                    + "`retryAfterSeconds`) and try again.", Map.of("rateLimited", example("Too many attempts", 429,
                    "Too Many Requests", "Too many attempts. Please wait about 13 minutes and try again.",
                    "RATE_LIMITED", Map.of("retryAfterSeconds", 780))));
            tooMany.addHeaderObject("Retry-After", new Header()
                    .description("Seconds to wait before trying again").schema(new IntegerSchema()));
            components.addResponses("TooManyRequests", tooMany);

            if (api.getPaths() == null) return;
            api.getPaths().forEach((path, item) -> {
                if (path.startsWith(PUBLIC_PREFIX)) return;
                item.readOperations().forEach(op -> {
                    op.addSecurityItem(new SecurityRequirement().addList(BEARER));
                    if (op.getResponses() != null && !op.getResponses().containsKey("401")) {
                        op.getResponses().addApiResponse("401", new ApiResponse().$ref(UNAUTHORIZED));
                    }
                });
            });
        };
    }

    private static ApiResponse error(String description, Map<String, Example> examples) {
        MediaType json = new MediaType().schema(new Schema<>().$ref(ERROR_SCHEMA));
        json.setExamples(new LinkedHashMap<>(examples));
        return new ApiResponse().description(description).content(new Content().addMediaType("application/json", json));
    }

    private static Example example(String summary, int status, String error, String message, String code,
                                   Map<String, Object> extra) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", "2026-11-02T10:15:30Z");
        body.put("status", status);
        body.put("error", error);
        body.put("message", message);
        body.put("code", code);
        body.putAll(extra);
        return new Example().summary(summary).value(body);
    }

    private static String description(boolean demoEnabled, Duration demoLifetime) {
        String signIn = demoEnabled
                ? "Call **POST /api/auth/demo** (Try it out, no body). It creates your own private demo with sample "
                + "data, deleted after " + DemoAccounts.describe(demoLifetime) + ", and signs you in; a few account "
                + "actions are turned off in it "
                + "(403 `DEMO_RESTRICTED`). Or sign in with your own account: **POST /api/auth/login**."
                : "Call **POST /api/auth/login** (Try it out) with your RoomTrack email and password.";
        return """
                The backend of [RoomTrack](https://roomtrack.app): one calendar for an owner's own bookings and \
                their Booking.com bookings, kept in sync through iCal links.

                ## How to authenticate
                1. %s
                2. Copy `token` from the answer, click **Authorize** at the top of this page and paste it.
                3. Every other request now carries `Authorization: Bearer <token>`. Sessions slide: when the token \
                gets close to expiring, a renewed one comes back in the `X-Refreshed-Token` response header.

                ## Data rules
                - Every request only sees the signed-in owner's data. Someone else's id answers 404, like an unknown id.
                - Dates are ISO `yyyy-MM-dd`. A stay is half-open `[checkIn, checkOut)`: `checkOut` is the departure \
                day, so a new stay may start on it.
                - Overlapping bookings of one unit are refused with **409 `DATES_TAKEN`**. The final guard is a \
                PostgreSQL exclusion constraint (`EXCLUDE USING gist (unit_id WITH =, stay_range WITH &&) WHERE \
                (status <> 'CANCELLED')`), so even simultaneous requests cannot double-book.
                - Errors have the shape `{timestamp, status, error, message, code}`; `code` is stable, `message` is \
                safe to show.

                ## Not listed here
                Each unit's public calendar feed (`GET /api/ical/{token}.ics`, an iCal file for Booking.com to read; \
                the token in the link is the only key) and the one-click unsubscribe pages in emails.
                """.formatted(signIn);
    }
}
