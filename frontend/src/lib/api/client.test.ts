import {describe, expect, it} from "vitest";
import {AxiosError} from "axios";
import {apiErrorMessage} from "./client.ts";

function axiosError(data: unknown, status = 400) {
    const err = new AxiosError("Request failed");
    err.response = {data, status, statusText: "", headers: {}, config: {} as never};
    return err;
}

describe("apiErrorMessage", () => {
    it("shows the message the backend sent", () => {
        expect(apiErrorMessage(axiosError({message: "Email already registered"}), "fallback")).toBe("Email already registered");
    });

    it("falls back when the response has no message", () => {
        expect(apiErrorMessage(axiosError({}), "fallback")).toBe("fallback");
        expect(apiErrorMessage(axiosError(null), "fallback")).toBe("fallback");
    });

    it("falls back for network errors and non-axios errors", () => {
        expect(apiErrorMessage(new AxiosError("Network Error"), "fallback")).toBe("fallback");
        expect(apiErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
        expect(apiErrorMessage(undefined, "fallback")).toBe("fallback");
    });
});
