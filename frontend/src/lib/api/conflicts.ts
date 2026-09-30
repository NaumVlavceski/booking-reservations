import {apiClient} from "./client.ts";

export interface SyncConflict {
    id: string;
    unitId: string;
    unitName: string;
    platform: "BOOKING" | "AIRBNB";
    incomingStart: string;
    incomingEnd: string;
    incomingSummary: string | null;
    conflictingReservationId: string;
    kind: "NEW_OVERLAP" | "CHANGE_OVERLAP";
    createdAt: string;
}
export async function getOpenConflicts(): Promise<SyncConflict[]> {
    const res = await apiClient.get<SyncConflict[]>("/api/conflicts");
    return res.data;
}
export async function dismissConflict(id: string): Promise<void> {
    await apiClient.post(`/api/conflicts/${id}/dismiss`);
}