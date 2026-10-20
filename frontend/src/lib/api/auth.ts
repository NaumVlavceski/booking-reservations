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

/** Emails a reset code if the address has an account. Always succeeds the same way, whether or not it does. */
export async function forgotPassword(email: string): Promise<void> {
    await apiClient.post("/api/auth/forgot-password", {email});
}

/** Trades the emailed code for a short-lived, one-time reset token. Keep the token in memory only. */
export async function verifyResetCode(data: { email: string; code: string }): Promise<string> {
    const res = await apiClient.post<{ resetToken: string }>("/api/auth/verify-reset-code", data);
    return res.data.resetToken;
}

/** Sets the new password. Signs out every existing session; the user logs in again afterwards. */
export async function resetPassword(data: { resetToken: string; newPassword: string }): Promise<void> {
    await apiClient.post("/api/auth/reset-password", data);
}
