import {Link, useParams} from "react-router-dom";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {getProperty} from "../lib/api/properties.ts";
import {getUnitsForProperty,deleteUnit} from "../lib/api/units.ts";

export default function PropertyDetailPage() {
    const {id} = useParams();
    const propertyId = id!;
    const queryClient = useQueryClient();
    const {data:property,isLoading:isLoadingProperty} = useQuery({
        queryKey: ["properties", propertyId],
        queryFn: ()=> getProperty(propertyId)
    });
    const {data:units,isLoading: isLoadingUnits} = useQuery({
        queryKey: ["units", propertyId],
        queryFn: ()=>getUnitsForProperty(propertyId),
    })
    const deleteMutation = useMutation({
        mutationFn: deleteUnit,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["units", propertyId] });
        },
    });
    const handleDelete = (unitId:string,unitName:string) => {
        if (confirm(`Delete "${unitName}"? This can't be undone.`)) {
            deleteMutation.mutate(unitId);
        }
    }
    if (isLoadingProperty) {
        return <div className="text-gray-500">Loading property...</div>;
    }

    if (!property) {
        return <div className="text-red-600">Property not found.</div>;
    }

    return (
        <div>
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">{property.name}</h1>
                    <p className="text-gray-600">{property.address}</p>
                </div>
                <Link
                    to={`/dashboard/properties/${propertyId}/edit`}
                    className="px-4 py-2 rounded font-medium text-gray-600 hover:bg-gray-100"
                >
                    Edit property
                </Link>
            </div>

            <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Units</h2>
                <Link
                    to={`/dashboard/properties/${propertyId}/units/new`}
                    className="bg-blue-600 text-white px-4 py-2 rounded font-medium"
                >
                    Add unit
                </Link>
            </div>

            {isLoadingUnits ? (
                <div className="text-gray-500">Loading units...</div>
            ) : !units || units.length === 0 ? (
                <div className="text-center py-12 bg-white border rounded-lg">
                    <p className="text-gray-600 mb-4">No units yet for this property.</p>
                    <Link
                        to={`/dashboard/properties/${propertyId}/units/new`}
                        className="text-blue-600 font-medium"
                    >
                        Add your first unit
                    </Link>
                </div>
            ) : (
                <div className="grid gap-3">
                    {units.map((unit) => (
                        <div
                            key={unit.id}
                            className="bg-white border rounded-lg p-4 flex justify-between items-center"
                        >
                            <div>
                                <h3 className="font-medium text-gray-900">{unit.name}</h3>
                                <p className="text-sm text-gray-600">
                                    Sleeps {unit.capacity}
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <Link
                                    to={`/dashboard/properties/${propertyId}/units/${unit.id}`}
                                    className="text-sm text-blue-600 font-medium"
                                >
                                    Edit
                                </Link>
                                <button
                                    onClick={() => handleDelete(unit.id, unit.name)}
                                    disabled={deleteMutation.isPending}
                                    className="text-sm text-red-600 font-medium disabled:opacity-50"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}