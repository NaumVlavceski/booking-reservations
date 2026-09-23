import {Link, useNavigate, useParams, useSearchParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {getProperties} from "../lib/api/properties.ts";
import {getUnitsForProperty} from "../lib/api/units.ts";
import {
    createReservation, getReservation,
    type ReservationRequest,
    updateReservation
} from "../lib/api/reservations.ts";
import {useEffect, useRef, useState} from "react";

type PricingField = "nightlyRate" | "totalAmount" | "pricePerGuest" | null;

export default function ReservationFormPage() {
    const {id} = useParams();
    const isEditing = Boolean(id);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [searchParams] = useSearchParams();
    const prefillUnitId = searchParams.get("unitId");
    const prefillCheckIn = searchParams.get("checkIn");

    const {data: existing} = useQuery({
        queryKey: ["reservations", "detail", id],
        queryFn: () => getReservation(id!),
        enabled: isEditing,
    });
    const [form, setForm] = useState<ReservationRequest>({
        unitId: prefillUnitId ?? "",
        checkIn: prefillCheckIn ?? "",
        checkOut: "",
        pricePerGuest: 0,
        nightlyRate: 0,
        totalAmount: 0,
        guestName: "",
        guestEmail: "",
        guestPhone: "",
        guestsCount: 2,
        notes: ""
    });
    useEffect(() => {
        if (existing) {
            setForm({
                unitId: existing.unitId,
                checkIn: existing.checkIn,
                checkOut: existing.checkOut,
                pricePerGuest: existing.pricePerGuest,
                nightlyRate: existing.nightlyRate,
                totalAmount: existing.totalAmount,
                guestName: existing.guestName,
                guestEmail: existing.guestEmail!,
                guestPhone: existing.guestPhone!,
                guestsCount: existing.guestsCount,
                notes: existing.notes
            })
        }
    }, [existing]);
    const [conflictMessage, setConflictMessage] = useState<string | null>(null);
    const [lastEdited, setLastEdited] = useState<PricingField>(null);
    const [priceRecalculatedNotice, setPriceRecalculatedNotice] = useState(false);
    const isFirstRun = useRef(true);
    const mutation = useMutation({
        mutationFn: (data: ReservationRequest) =>
            isEditing ? updateReservation(id!, data) : createReservation(data),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey: ["reservations"]});
            navigate("/dashboard/calendar")
        },
        onError: (error: any) => {
            if (error.response?.status === 409) {
                setConflictMessage(error.response.data?.message ?? "These dates are no longer available.");
            } else {
                setConflictMessage(null);
            }
        },
    });
    const {data: properties} = useQuery({
        queryKey: ["properties"],
        queryFn: getProperties,
    });
    const {data: allUnits} = useQuery({
        queryKey: ["units", "all"],
        queryFn: async () => {
            if (!properties) return [];
            const perProperty = await Promise.all(properties.map((p) => getUnitsForProperty(p.id)));
            return perProperty.flat();
        },
        enabled: !!properties,
    });

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setConflictMessage(null);
        mutation.mutate(form)
    }

    function onChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
        setForm({...form, [e.target.name]: e.target.value});
    }

    useEffect(() => {
        if (!form.checkIn || !form.checkOut) return;
        const nights = Math.round(
            (new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (nights <= 0) return;
        if (lastEdited === "nightlyRate" && form.nightlyRate) {
            const rate = Number(form.nightlyRate);
            if (!isNaN(rate)) {
                setForm((f) => ({
                    ...f, totalAmount: Number((rate * nights).toFixed(2)),
                    pricePerGuest: Number((rate / form.guestsCount).toFixed(2)),
                }));
            }
        } else if (lastEdited === "totalAmount" && form.totalAmount) {
            const total = Number(form.totalAmount);
            if (!isNaN(total)) {
                setForm((f) => ({
                    ...f, nightlyRate: Number((total / nights).toFixed(2)),
                    pricePerGuest: Number((total / nights / form.guestsCount).toFixed(2)),
                }));
            }
        } else if (lastEdited === "pricePerGuest" && form.pricePerGuest) {
            const perGuest = Number(form.pricePerGuest);
            if (!isNaN(perGuest)) {
                setForm((f) => ({
                    ...f, nightlyRate: Number((perGuest * form.guestsCount).toFixed(2)),
                    totalAmount: Number((perGuest * nights * form.guestsCount).toFixed(2)),
                }));
            }
        }
    }, [form.checkIn, form.checkOut, form.nightlyRate, form.pricePerGuest, form.guestsCount, form.totalAmount, lastEdited]);
    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false;
            return;
        }
        if (!form.nightlyRate && !form.totalAmount && !form.pricePerGuest) return;

        setPriceRecalculatedNotice(true);
        const timer = setTimeout(() => setPriceRecalculatedNotice(false), 3000);
        return () => clearTimeout(timer);
    }, [form.checkIn, form.checkOut, form.guestsCount]);
    return (
        <div className="max-w-lg">
            <h1 className="text-2xl font-semibold text-gray-900 mb-6">
                {isEditing ? "Edit reservation" : "New reservation"}
            </h1>
            {priceRecalculatedNotice && (
                <div
                    className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded px-3 py-2 flex justify-between items-center">
                    <span>Total price was recalculated based on your changes.</span>
                    <button
                        type="button"
                        onClick={() => setPriceRecalculatedNotice(false)}
                        className="text-blue-500 hover:text-blue-700 font-bold ml-3"
                    >
                        ×
                    </button>
                </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4 bg-white border rounded-lg p-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                    <select
                        name="unitId"
                        value={form.unitId}
                        onChange={onChange}
                        required
                        className="w-full border rounded px-3 py-2"
                    >
                        <option value="">Select a unit</option>
                        {allUnits?.map((unit) => (
                            <option key={unit.id} value={unit.id}>
                                {unit.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-2 gap-3">

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label>
                        <input
                            type="date"
                            name="checkIn"
                            value={form.checkIn}
                            onChange={(e) => {
                                onChange(e);
                                setLastEdited("nightlyRate")
                            }}
                            required
                            className="w-full border rounded px-3 py-2"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
                        <input
                            type="date"
                            name="checkOut"
                            value={form.checkOut}
                            onChange={(e) => {
                                onChange(e);
                                setLastEdited("nightlyRate")
                            }}
                            required
                            className="w-full border rounded px-3 py-2"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Price per guest
                        </label>
                        <input
                            type="number"
                            min={1}
                            step="0.01"
                            name="pricePerGuest"
                            value={form.pricePerGuest}
                            onChange={(e) => {
                                onChange(e);
                                setLastEdited("pricePerGuest");
                            }}
                            disabled={!form.checkIn || !form.checkOut}
                            placeholder={!form.checkIn || !form.checkOut ? "Pick dates first" : ""}
                            className="w-full border rounded px-3 py-2 disabled:bg-gray-50"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nightly rate
                        </label>
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            name="nightlyRate"
                            value={form.nightlyRate}
                            onChange={(e) => {
                                onChange(e);
                                setLastEdited("nightlyRate");
                            }}
                            disabled={!form.checkIn || !form.checkOut}
                            placeholder={!form.checkIn || !form.checkOut ? "Pick dates first" : ""}
                            className="w-full border rounded px-3 py-2 disabled:bg-gray-50"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Total amount
                        </label>
                        <input
                            type="number"
                            min={0}
                            step="0.01"
                            name="totalAmount"
                            value={form.totalAmount}
                            onChange={(e) => {
                                onChange(e);
                                setLastEdited("totalAmount");
                            }}
                            disabled={!form.checkIn || !form.checkOut}
                            placeholder={!form.checkIn || !form.checkOut ? "Pick dates first" : ""}
                            className="w-full border rounded px-3 py-2 disabled:bg-gray-50"
                        />
                    </div>
                </div>
                <p className="text-xs text-gray-500 -mt-2">
                    Enter either field — the other calculates automatically.
                </p>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Guest name</label>
                    <input
                        name="guestName"
                        value={form.guestName}
                        onChange={onChange}
                        className="w-full border rounded px-3 py-2"
                    />
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                            type="email"
                            name="guestEmail"
                            value={form.guestEmail}
                            onChange={onChange}
                            className="w-full border rounded px-3 py-2"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input
                            type="tel"
                            name="guestPhone"
                            value={form.guestPhone}
                            onChange={onChange}
                            className="w-full border rounded px-3 py-2"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Guests</label>
                    <input
                        type="number"
                        min={1}
                        name="guestsCount"
                        value={form.guestsCount}
                        onChange={(e) => {
                            onChange(e);
                            setLastEdited("pricePerGuest");
                        }}
                        required
                        className="w-32 border rounded px-3 py-2"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea
                        name="notes"
                        value={form.notes}
                        onChange={onChange}
                        rows={2}
                        className="w-full border rounded px-3 py-2"
                    />
                </div>

                {conflictMessage && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2">
                        {conflictMessage}
                    </div>
                )}
                {mutation.isError && !conflictMessage && (
                    <p className="text-red-600 text-sm">Something went wrong. Check your details and try again.</p>
                )}

                <div className="flex gap-3 pt-2">
                    <button
                        type="submit"
                        disabled={mutation.isPending}
                        className="bg-blue-600 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
                    >
                        {mutation.isPending ? "Saving..." : isEditing ? "Save changes" : "Create reservation"}
                    </button>
                    <Link
                        to="/dashboard/calendar"
                        className="px-4 py-2 rounded font-medium text-gray-600 hover:bg-gray-100"
                    >
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    )
}