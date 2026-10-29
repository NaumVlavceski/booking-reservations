import {queryOptions} from "@tanstack/react-query";
import {apiClient} from "./client.ts";
import type {AuthResponse} from "./auth.ts";

export interface MeResponse {
    email: string;
    fullName: string;
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
