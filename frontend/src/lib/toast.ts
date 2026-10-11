import {createContext, useContext} from "react";

export type ToastTone = "success" | "error" | "info";

export interface ToastOptions {
    tone?: ToastTone;
    /** Optional inline action, e.g. "Undo" or "View". Clicking it also closes the toast. */
    action?: { label: string; onClick: () => void };
    durationMs?: number;
}

export interface ToastApi {
    show: (message: string, options?: ToastOptions) => void;
}

export const ToastContext = createContext<ToastApi>({show: () => {}});

/** Short, non-blocking confirmation at the bottom of the screen ("Booking saved", sync results…). */
export function useToast(): ToastApi {
    return useContext(ToastContext);
}
