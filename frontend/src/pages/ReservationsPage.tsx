import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {getProperties} from "../lib/api/properties.ts";
import {getUnitsForProperty} from "../lib/api/units.ts";
import {deleteReservation, getReservations} from "../lib/api/reservations.ts";
import {Link} from "react-router-dom";

export default function ReservationsPage() {
    const [unitId, setUnitId] = useState("");
    const [status, setStatus] = useState("");
    const queryClient = useQueryClient();

    const {data: properties} = useQuery({
        queryKey: ["properties"],
        queryFn: getProperties,
    })
    const {data: allUnits} = useQuery({
        queryKey: ["units", "all"],
        queryFn: async () =>{
            if (!properties) return [];
            const perProperty = await Promise.all(
                properties.map((p) => getUnitsForProperty(p.id))
            );
            return perProperty.flat();
        },
        enabled: !!properties
    });
    const { data: reservations, isLoading, isError } = useQuery({
        queryKey: ["reservations", unitId, status],
        queryFn: () =>
            getReservations({
                unitId: unitId || undefined,
                status: status || undefined,
            }),
    });
    const deleteMutation = useMutation({
        mutationFn: deleteReservation,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["reservations"] });
        },
    });
    function handleDelete(id: string, guestName: string) {
        if (confirm(`Delete the reservation for "${guestName}"? This frees up the dates.`)) {
            deleteMutation.mutate(id);
        }
    }
    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Reservations</h1>
                <Link
                    to="/dashboard/reservations/new"
                    className="bg-blue-600 text-white px-4 py-2 rounded font-medium"
                >
                    New reservation
                </Link>
            </div>

            <div className="flex gap-3 mb-4">
                <select
                    value={unitId}
                    onChange={(e) => setUnitId(e.target.value)}
                    className="border rounded px-3 py-2 text-sm"
                >
                    <option value="">All units</option>
                    {allUnits?.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                            {unit.name}
                        </option>
                    ))}
                </select>

                <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="border rounded px-3 py-2 text-sm"
                >
                    <option value="">All statuses</option>
                    <option value="CONFIRMED">Confirmed</option>
                    <option value="CANCELLED">Cancelled</option>
                </select>
            </div>

            {isLoading ? (
                <div className="text-gray-500">Loading reservations...</div>
            ) : isError ? (
                <div className="text-red-600">Couldn't load reservations.</div>
            ) : !reservations || reservations.length === 0 ? (
                <div className="text-center py-16 bg-white border rounded-lg">
                    <p className="text-gray-600 mb-4">No reservations match these filters.</p>
                </div>
            ) : (
                <div className="bg-white border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b text-left text-gray-600">
                        <tr>
                            <th className="px-4 py-2">Guest</th>
                            <th className="px-4 py-2">Check-in</th>
                            <th className="px-4 py-2">Check-out</th>
                            <th className="px-4 py-2">Status</th>
                            <th className="px-4 py-2">Total</th>
                            <th className="px-4 py-2"></th>
                        </tr>
                        </thead>
                        <tbody>
                        {reservations.map((r) => (
                            <tr key={r.id} className="border-b last:border-0">
                                <td className="px-4 py-2 font-medium text-gray-900">{r.guestName}</td>
                                <td className="px-4 py-2">{r.checkIn}</td>
                                <td className="px-4 py-2">{r.checkOut}</td>
                                <td className="px-4 py-2">
                    <span
                        className={
                            r.status === "CONFIRMED"
                                ? "text-green-700 bg-green-50 px-2 py-0.5 rounded text-xs"
                                : "text-gray-500 bg-gray-100 px-2 py-0.5 rounded text-xs"
                        }
                    >
                      {r.status}
                    </span>
                                </td>
                                <td className="px-4 py-2">
                                    {r.totalAmount}
                                </td>
                                <td className="px-4 py-2 text-right">
                                    <Link
                                        to={`/dashboard/reservations/${r.id}`}
                                        className="text-blue-600 font-medium mr-3"
                                    >
                                        Edit
                                    </Link>
                                    <button
                                        onClick={() => handleDelete(r.id, r.guestName)}
                                        disabled={deleteMutation.isPending}
                                        className="text-red-600 font-medium disabled:opacity-50"
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}