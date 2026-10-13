import {apiClient} from "./client.ts";

export interface NotificationSettings {
    enabled: boolean;
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
    const res = await apiClient.get<NotificationSettings>("/api/notifications/settings");
    return res.data;
}

export async function setNotificationsEnabled(enabled: boolean): Promise<NotificationSettings> {
    const res = await apiClient.put<NotificationSettings>("/api/notifications/settings", {enabled});
    return res.data;
}
