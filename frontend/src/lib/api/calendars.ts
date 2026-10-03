import {apiClient} from "./client.ts";

export interface ExternalCalendar {
    id: string;
    unitId: string;
    unitName: string;
    platform: "BOOKING" | "AIRBNB";
    lastSyncedAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    consecutiveFailures: number;
}

export async function getFailingCalendars(): Promise<ExternalCalendar[]> {
    const res = await apiClient.get<ExternalCalendar[]>("/api/calendars/health");
    return res.data;
}
export async function getUnitCalendars(unitId: string): Promise<ExternalCalendar[]> {
    const res = await apiClient.get<ExternalCalendar[]>(`/api/units/${unitId}/calendars`);
    return res.data;
}

export async function addCalendar(
    unitId: string,
    platform: "BOOKING" | "AIRBNB",
    icsUrl: string
): Promise<ExternalCalendar> {
    const res = await apiClient.post<ExternalCalendar>(`/api/units/${unitId}/calendars`, {
        platform,
        icsUrl,
    });
    return res.data;
}

export async function deleteCalendar(id: string): Promise<void> {
    await apiClient.delete(`/api/calendars/${id}`);
}

export async function syncCalendarNow(id: string): Promise<ExternalCalendar> {
    const res = await apiClient.post<ExternalCalendar>(`/api/calendars/${id}/sync`);
    return res.data;
}