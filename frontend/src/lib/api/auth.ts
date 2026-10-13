// src/lib/api/auth.ts
import { apiClient } from "./client";

export interface RegisterRequest {
    businessName: string;
    contactPhone: string;
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

export interface RegistrationResponse {
    email: string;
    verificationRequired: boolean;
}

export interface VerifyEmailRequest {
    email: string;
    code: string;
}

/** Creates the account and emails a code. No token yet: the address has to be verified first. */
export async function register(data: RegisterRequest): Promise<RegistrationResponse> {
    const res = await apiClient.post<RegistrationResponse>("/api/auth/register", data);
    return res.data;
}

export async function login(data: LoginRequest): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>("/api/auth/login", data);
    return res.data;
}

export async function verifyEmail(data: VerifyEmailRequest): Promise<AuthResponse> {
    const res = await apiClient.post<AuthResponse>("/api/auth/verify-email", data);
    return res.data;
}

/** Always succeeds the same way, whether or not the address exists. */
export async function resendCode(email: string): Promise<void> {
    await apiClient.post("/api/auth/resend-code", {email});
}
