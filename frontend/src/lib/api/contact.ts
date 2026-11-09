import {apiClient} from "./client";

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
