import {apiClient} from "./client";
import {errorCode, errorMessage} from "../errors";

export interface ContactRequest {
    email: string;
    subject: string;
    message: string;
    /** The spam trap: a field people never see, so it stays empty unless a bot fills it in. */
    website: string;
}

/**
 * Emails the message to RoomTrack; the reply goes to `email`. No sign-in needed. Fails with 503
 * CONTACT_UNAVAILABLE (form switched off) or CONTACT_FAILED (the email could not be sent).
 */
export async function sendContactMessage(data: ContactRequest): Promise<void> {
    await apiClient.post("/api/contact", data);
}

/**
 * "Contact support" from inside the app: only the message. The reply goes to the signed-in account's own email
 * (the server takes it from the session). Same 503 errors as the contact form; 403 DEMO_RESTRICTED in the demo.
 */
export async function sendSupportMessage(message: string): Promise<void> {
    await apiClient.post("/api/me/support", {message});
}

/** The longest message the server accepts (ContactRequest.java, SupportRequest.java). */
export const MAX_MESSAGE = 5000;

/** Why a contact or support message didn't go, in plain words. */
export function contactSendError(error: unknown): string {
    switch (errorCode(error)) {
        case "CONTACT_UNAVAILABLE":
            return "Messages can't be sent right now. Please try again later.";
        case "CONTACT_FAILED":
            return "Your message couldn't be sent right now. Please try again in a few minutes.";
        default:
            return errorMessage(error, "Couldn't send your message.");
    }
}
