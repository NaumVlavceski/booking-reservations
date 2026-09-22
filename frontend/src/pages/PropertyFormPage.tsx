import {Link, useNavigate, useParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useEffect, useState} from "react";
import {
    createProperty,
    getProperty,
    type PropertyRequest,
    updateProperty
} from "../lib/api/properties.ts";

export default function PropertyFormPage() {
    const {id} = useParams();
    const isEditing = Boolean(id);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [form, setForm] = useState<PropertyRequest>({
        name: "",
        address: "",
        timezone: "Europe/Skopje",
    })
    const {data: existing, isLoading: isLoadingExisting} = useQuery({
        queryKey: ["properties", id],
        queryFn: () => getProperty(id!),
        enabled: isEditing,
    });
    useEffect(() => {
        if (existing) {
            setForm({
                name: existing.name,
                address: existing.address,
                timezone: existing.timezone,
            });
        }
    }, [existing]);
    const mutation = useMutation({
        mutationFn: (data: PropertyRequest) =>
            isEditing ? updateProperty(id!, data) : createProperty(data),
        onSuccess: ()=>{
            queryClient.invalidateQueries({queryKey: ["properties"]});
            navigate("/dashboard/properties");
        }
    })
    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        mutation.mutate(form);
    }
    if (isEditing && isLoadingExisting) {
        return <div className="text-gray-500">Loading property...</div>;
    }
    return (
        <div className="max-w-lg">
            <h1 className="text-2xl font-semibold text-gray-900 mb-6">
                {isEditing ? "Edit property" : "Add a property"}
            </h1>

            <form onSubmit={handleSubmit} className="space-y-4 bg-white border rounded-lg p-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Name
                    </label>
                    <input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        required
                        placeholder="Apartments Vlavcheski"
                        className="w-full border rounded px-3 py-2"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Address
                    </label>
                    <input
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        required
                        placeholder="Peštani, Lake Ohrid, North Macedonia"
                        className="w-full border rounded px-3 py-2"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Timezone
                    </label>
                    <input
                        value={form.timezone}
                        onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                    />
                </div>

                {mutation.isError && (
                    <p className="text-red-600 text-sm">
                        Something went wrong. Check your details and try again.
                    </p>
                )}

                <div className="flex gap-3 pt-2">
                    <button
                        type="submit"
                        disabled={mutation.isPending}
                        className="bg-blue-600 text-white px-4 py-2 rounded font-medium disabled:opacity-50"
                    >
                        {mutation.isPending ? "Saving..." : isEditing ? "Save changes" : "Add property"}
                    </button>
                    <Link
                        to="/dashboard/properties"
                        className="px-4 py-2 rounded font-medium text-gray-600 hover:bg-gray-100"
                    >
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}