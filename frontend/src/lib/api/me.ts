import {apiClient} from "./client.ts";
import type {AuthResponse} from "./auth.ts";

export interface MeResponse {
    email: string;
    fullName: string;
    businessName: string;
}

export async function getMe(): Promise<MeResponse> {
    const res = await apiClient.get<MeResponse>("/api/me");
    return res.data;
}

/** Signs out every other device; returns a fresh token that keeps this one signed in. */
export async function changePassword(data: { currentPassword: string; newPassword: string }): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>("/api/me/password", data);
    return res.data;
}
