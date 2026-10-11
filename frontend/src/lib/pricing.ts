import type {ReservationRequest} from "./api/reservations.ts";

export type PricingField = "nightlyRate" | "totalAmount" | "pricePerGuest" | null;

export function repriceForm(form: ReservationRequest, lastEdited: PricingField): ReservationRequest {
    if (!form.checkIn || !form.checkOut) return form;
    const nights = Math.round(
        (new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (nights <= 0) return form;
    const round = (n: number) => Number(n.toFixed(2));
    let patch: Partial<ReservationRequest> | null = null;
    if (lastEdited === "nightlyRate" && form.nightlyRate) {
        const rate = Number(form.nightlyRate);
        if (!isNaN(rate)) patch = {totalAmount: round(rate * nights), pricePerGuest: round(rate / form.guestsCount)};
    } else if (lastEdited === "totalAmount" && form.totalAmount) {
        const total = Number(form.totalAmount);
        if (!isNaN(total)) patch = {nightlyRate: round(total / nights), pricePerGuest: round(total / nights / form.guestsCount)};
    } else if (lastEdited === "pricePerGuest" && form.pricePerGuest) {
        const perGuest = Number(form.pricePerGuest);
        if (!isNaN(perGuest)) patch = {nightlyRate: round(perGuest * form.guestsCount), totalAmount: round(perGuest * nights * form.guestsCount)};
    }
    if (!patch) return form;
    const changed = (Object.keys(patch) as (keyof ReservationRequest)[]).some((k) => form[k] !== patch![k]);
    return changed ? {...form, ...patch} : form;
}
