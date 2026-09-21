// src/lib/api/auth.ts
import { apiClient } from "./client";

export interface RegisterRequest {
    businessName: string;
    contactEmail: string;
    email: string;
    password: string;
    fullName: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface AuthResponse {
    token: string;
    email: string;
    fullName: string;
}

export async function register(data: RegisterRequest): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>("/api/auth/register", data);
    return res.data;
}

export async function login(data: LoginRequest): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>("/api/auth/login", data);
    return res.data;
}