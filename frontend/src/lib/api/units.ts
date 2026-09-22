import {apiClient} from "./client.ts";

export interface UnitRequest {
    name: string,
    capacity: number,

}
export interface UnitResponse {
    id: string,
    propertyId: string,
    name: string,
    capacity: number,
}

export async function getUnitsForProperty(propertyId:string): Promise<UnitResponse[]> {
    const res = await apiClient.get<UnitResponse[]>(`/api/properties/${propertyId}/units`)
    return res.data;
}
export async function getUnit(id:string): Promise<UnitResponse> {
    const res = await apiClient.get<UnitResponse>(`/api/units/${id}`)
    return res.data;
}
export async function createUnit(propertyId:string,data:UnitRequest): Promise<UnitResponse> {
    const res = await apiClient.post<UnitResponse>(`/api/properties/${propertyId}/units`, data);
    return res.data;
}
export async function updateUnit(id:string,data:UnitRequest): Promise<UnitResponse> {
    const res = await apiClient.put<UnitResponse>(`/api/units/${id}`, data);
    return res.data;
}
export async function deleteUnit(id:string): Promise<void> {
    await apiClient.delete<UnitResponse>(`/api/units/${id}`);
}