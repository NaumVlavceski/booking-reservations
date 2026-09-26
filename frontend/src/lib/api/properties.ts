import {queryOptions} from "@tanstack/react-query";
import {apiClient} from "./client.ts";

export interface PropertyRequest {
    name: string;
    address: string;
    timezone?: string;
    // Create only: backend generates "Room 1".."Room N" with capacity 2.
    unitCount?: number;
}
export interface PropertyResponse {
    id: string;
    name: string;
    address: string;
    timezone: string;
    createdAt: string;
}

export async function getProperties(): Promise<PropertyResponse[]> {
    const res = await apiClient.get<PropertyResponse[]>("/api/properties");
    return res.data;
}

export const propertiesQuery = queryOptions({queryKey: ["properties"], queryFn: getProperties});
export async function getProperty(id: string): Promise<PropertyResponse> {
    const res = await apiClient.get<PropertyResponse>(`/api/properties/${id}`);
    return res.data;
}

export async function createProperty(data: PropertyRequest): Promise<PropertyResponse> {
    const res = await apiClient.post<PropertyResponse>("/api/properties", data);
    return res.data;
}

export async function updateProperty(id: string, data: PropertyRequest): Promise<PropertyResponse> {
    const res = await apiClient.put<PropertyResponse>(`/api/properties/${id}`, data);
    return res.data;
}

export async function deleteProperty(id: string): Promise<void> {
    await apiClient.delete(`/api/properties/${id}`);
}