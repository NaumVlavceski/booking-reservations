import {afterEach, describe, expect, it, vi} from "vitest";
import {AxiosError, AxiosHeaders, type InternalAxiosRequestConfig} from "axios";
import {errorCode, errorKind, errorMessage, errorReason, fieldErrors, isConnectionError, logError} from "./errors";

function httpError(status: number, data: unknown = {}, url = "/api/reservations", method = "post"): AxiosError {
    const config = {url, method, headers: new AxiosHeaders()} as InternalAxiosRequestConfig;
    return new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_RESPONSE", config, {}, {
        status, statusText: "", headers: {}, config, data,
    });
}

function noAnswer(code: string, url = "/api/reservations"): AxiosError {
    const config = {url, method: "get", headers: new AxiosHeaders()} as InternalAxiosRequestConfig;
    return new AxiosError("Network Error", code, config, {});
}

describe("errorKind", () => {
    it.each([
        [noAnswer("ERR_NETWORK"), "network"],
        [noAnswer("ECONNABORTED"), "timeout"],
        [noAnswer("ETIMEDOUT"), "timeout"],
        [httpError(401), "session"],
        [httpError(401, {}, "/api/auth/login"), "badRequest"],
        [httpError(403), "forbidden"],
        [httpError(403, {code: "DEMO_RESTRICTED"}), "demo"],
        [httpError(404), "notFound"],
        [httpError(408), "timeout"],
        [httpError(409), "conflict"],
        [httpError(409, {code: "DATES_TAKEN"}), "datesTaken"],
        [httpError(400, {code: "VALIDATION_FAILED"}), "validation"],
        [httpError(429), "rateLimited"],
        [httpError(429, {code: "RATE_LIMITED"}), "rateLimited"],
        [httpError(500), "server"],
        [httpError(502), "server"],
        [httpError(400), "badRequest"],
        [httpError(418), "badRequest"],
        [httpError(200, {code: "INTERNAL"}), "server"],
    ] as const)("%#: → %s", (error, kind) => {
        expect(errorKind(error)).toBe(kind);
    });

    it("anything that is not an axios error is unknown", () => {
        expect(errorKind(new Error("boom"))).toBe("unknown");
        expect(errorKind(null)).toBe("unknown");
        expect(errorKind("text")).toBe("unknown");
    });

    it("a body that is not JSON (an HTML 502 page from a proxy) still maps by status", () => {
        expect(errorKind(httpError(502, "<html>Bad gateway</html>"))).toBe("server");
        expect(errorMessage(httpError(502, "<html>Bad gateway</html>"), "Couldn't save.")).toBe(
            "Couldn't save. Something went wrong on our side. Please try again in a moment.");
    });
});

describe("errorMessage / errorReason", () => {
    it("a server rule written for people replaces the generic sentence", () => {
        expect(errorMessage(httpError(400, {message: "Check-out must be after check-in"}), "Couldn't save the booking."))
            .toBe("Check-out must be after check-in");
    });

    it("technical server text is hidden", () => {
        for (const message of ["Malformed JSON request", "Required request body is missing", "Invalid value for 'status'", "No static resource api/x"]) {
            expect(errorMessage(httpError(400, {message}), "Couldn't save.")).toBe("Couldn't save. That didn't work. Please check the details and try again.");
        }
    });

    it("documented: any ALL-CAPS word of 4+ letters also hides a human message (e.g. 'Type DELETE to confirm.')", () => {
        expect(errorMessage(httpError(400, {message: "Type DELETE to confirm."}), "Couldn't delete your account."))
            .toBe("Couldn't delete your account. That didn't work. Please check the details and try again.");
    });

    it("dates taken names the room and the stay", () => {
        const err = httpError(409, {code: "DATES_TAKEN", room: "Room 2", takenFrom: "2026-11-12", takenTo: "2026-11-15"});
        expect(errorReason(err)).toMatch(/^Room 2 is already booked 12–15 Nov(?: 2026)?\. Pick other dates or another room\.$/);
        expect(errorMessage(err, "Couldn't save.")).toBe(errorReason(err));
    });

    it("dates taken without details falls back", () => {
        expect(errorReason(httpError(409, {code: "DATES_TAKEN"}))).toBe("Those dates are already booked. Pick other dates or another room.");
    });

    it("validation with field errors points at the fields", () => {
        const err = httpError(400, {code: "VALIDATION_FAILED", fieldErrors: {guestEmail: "must be a well-formed email address"}});
        expect(errorReason(err)).toBe("Some details need fixing. Check the highlighted fields.");
        expect(fieldErrors(err)).toEqual({guestEmail: "must be a well-formed email address"});
    });

    it("empty fieldErrors is no field errors", () => {
        expect(fieldErrors(httpError(400, {fieldErrors: {}}))).toBeNull();
        expect(fieldErrors(new Error("x"))).toBeNull();
    });

    it("rate limited: the server's wait time is shown", () => {
        expect(errorReason(httpError(429, {message: "Please wait about 15 minutes and try again."})))
            .toBe("Please wait about 15 minutes and try again.");
    });

    it("demo restrictions explain themselves", () => {
        expect(errorReason(httpError(403, {code: "DEMO_RESTRICTED"}))).toBe("This is turned off in the demo account.");
    });

    it("network and session", () => {
        expect(errorMessage(noAnswer("ERR_NETWORK"), "Couldn't save.")).toBe("Couldn't save. Can't reach RoomTrack. Check your internet connection and try again.");
        expect(errorReason(httpError(401))).toBe("Your session expired. Please sign in again.");
    });

    it("server messages are not interpreted as HTML (plain strings only)", () => {
        const message = "<img src=x onerror=alert(1)>";
        expect(errorMessage(httpError(400, {message}), "x")).toBe(message); // rendered as a JSX text node
    });
});

describe("errorCode / isConnectionError", () => {
    it("reads the code", () => {
        expect(errorCode(httpError(403, {code: "EMAIL_NOT_VERIFIED"}))).toBe("EMAIL_NOT_VERIFIED");
        expect(errorCode(httpError(403))).toBeUndefined();
        expect(errorCode("nope")).toBeUndefined();
    });
    it("connection errors", () => {
        expect(isConnectionError(noAnswer("ERR_NETWORK"))).toBe(true);
        expect(isConnectionError(noAnswer("ECONNABORTED"))).toBe(true);
        expect(isConnectionError(httpError(500))).toBe(false);
    });
});

describe("logError", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("production logs only method, path without query, and status (no guest names, no bodies)", () => {
        vi.stubEnv("DEV", false);
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        logError(httpError(400, {message: "guest@example.test is invalid"}, "/api/reservations/cancelled?name=Ana%20Petrova", "get"), "Loading");
        expect(spy).toHaveBeenCalledTimes(1);
        const printed = spy.mock.calls[0].map(String).join(" ");
        expect(printed).toBe("[RoomTrack] Loading: GET /api/reservations/cancelled 400");
        expect(printed).not.toContain("Ana");
        expect(printed).not.toContain("guest@example.test");
    });

    it("development logs the full URL and body", () => {
        vi.stubEnv("DEV", true);
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        logError(httpError(400, {message: "x"}, "/api/x?y=1", "get"));
        expect(spy.mock.calls[0][0]).toBe("[RoomTrack] GET /api/x?y=1");
    });

    it("non-axios errors are logged as they are", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        const err = new Error("boom");
        logError(err, "Somewhere");
        expect(spy).toHaveBeenCalledWith("[RoomTrack] Somewhere:", err);
    });
});
