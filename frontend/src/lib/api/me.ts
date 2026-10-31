import {queryOptions} from "@tanstack/react-query";
import {apiClient, slowRequest} from "./client.ts";
import type {AuthResponse} from "./auth.ts";

export interface MeResponse {
    email: string;
    fullName: string;
    /** The legal versions this account accepted (null for accounts from before acceptance was recorded). */
    termsVersion: string | null;
    privacyVersion: string | null;
    termsAcceptedAt: string | null;
}

export async function getMe(): Promise<MeResponse> {
    const res = await apiClient.get<MeResponse>("/api/me");
    return res.data;
}

/** Who is signed in. Not refetched on its own: it only changes with a new sign-in. */
export const meQuery = queryOptions({queryKey: ["me"], queryFn: getMe, staleTime: Infinity});

/** Signs out every other device; returns a fresh token that keeps this one signed in. */
export async function changePassword(data: { currentPassword: string; newPassword: string }): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>("/api/me/password", data);
    return res.data;
}

/** "Download my data": everything in this account as a JSON file, saved by the browser. Limited to a few per hour. */
export async function downloadMyData(): Promise<void> {
    const res = await apiClient.get<Blob>("/api/me/export", {responseType: "blob", ...slowRequest});
    const disposition = String(res.headers["content-disposition"] ?? "");
    const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? "roomtrack-data.json";
    const url = URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoke a little later: some browsers (Safari) read the file only after click() has returned.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Deletes the account and everything in it, at once and for good. Needs the password and the typed word DELETE. */
export async function deleteAccount(data: { password: string; confirmation: string }): Promise<void> {
    await apiClient.post("/api/me/delete", data);
}
