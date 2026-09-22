import {Link, useNavigate, useParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useEffect, useState} from "react";
import {createUnit, getUnit, type UnitRequest, updateUnit} from "../lib/api/units.ts";

export default function UnitFormPage() {
    const {propertyId, unitId} = useParams();
    const isEditing = Boolean(unitId);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [form, setForm] = useState<UnitRequest>({
        name: "",
        capacity: 2,
        });
    const {data: existing, isLoading: isLoadingExisting} = useQuery({
        queryKey: ["units", "detail", unitId],
        queryFn: () => getUnit(unitId!),
        enabled: isEditing,
    })
    useEffect(() => {
        if (existing) {
            setForm({
                name: existing.name,
                capacity: existing.capacity,
            })
        }
    }, [existing]);
    const mutation = useMutation({
        mutationFn: (data: UnitRequest) =>
            isEditing ? updateUnit(unitId!, data) : createUnit(propertyId!, data),
        onSuccess: () => {
            queryClient.invalidateQueries({queryKey:["units",propertyId]});
            navigate(`/dashboard/properties/${propertyId!}`);
        }
    })
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        mutation.mutate(form);
    }
    if (isEditing && isLoadingExisting) {
        return <div className="text-gray-500">Loading unit...</div>;
    }
    return (
        <div className="max-w-lg">
            <h1 className="text-2xl font-semibold text-gray-900 mb-6">
                {isEditing ? "Edit unit" : "Add a unit"}
            </h1>

            <form onSubmit={handleSubmit} className="space-y-4 bg-white border rounded-lg p-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        required
                        placeholder="Double room 1"
                        className="w-full border rounded px-3 py-2"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                    <input
                        type="number"
                        min={1}
                        value={form.capacity}
                        onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                        required
                        className="w-full border rounded px-3 py-2"
                    />
                </div>

                {mutation.isError && (
                    <p className="text-red-600 text-sm">Something went wrong. Try again.</p>
                )}

                <div className="flex gap-3 pt-2">
                    <button
                        type="submit"
                        disabled={mutation.isPending}
                        className="bg-blue-600 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
                    >
                        {mutation.isPending ? "Saving..." : isEditing ? "Save changes" : "Add unit"}
                    </button>
                    <Link
                        to={`/dashboard/properties/${propertyId}`}
                        className="px-4 py-2 rounded font-medium text-gray-600 hover:bg-gray-100"
                    >
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}