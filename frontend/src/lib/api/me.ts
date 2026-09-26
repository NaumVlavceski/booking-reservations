import {apiClient} from "./client.ts";

export interface MeResponse {
    email: string;
    fullName: string;
    businessName: string;
}

export async function getMe(): Promise<MeResponse> {
    const res = await apiClient.get<MeResponse>("/api/me");
    return res.data;
}
