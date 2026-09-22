// src/pages/PropertiesPage.tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getProperties } from "../lib/api/properties";

export default function PropertiesPage() {
    const { data: properties, isLoading, isError } = useQuery({
        queryKey: ["properties"],
        queryFn: getProperties,
    });

    if (isLoading) {
        return <div className="text-gray-500">Loading properties...</div>;
    }

    if (isError) {
        return (
            <div className="text-red-600">
                Couldn't load properties. Try refreshing the page.
            </div>
        );
    }

    if (!properties || properties.length === 0) {
        return (
            <div className="text-center py-16">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                    No properties yet
                </h2>
                <p className="text-gray-600 mb-6">
                    Add your first property to start setting up units and reservations.
                </p>
                <Link
                    to="/dashboard/properties/new"
                    className="inline-block bg-blue-600 text-white px-4 py-2 rounded font-medium"
                >
                    Add a property
                </Link>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Properties</h1>
                <Link
                    to="/dashboard/properties/new"
                    className="bg-blue-600 text-white px-4 py-2 rounded font-medium"
                >
                    Add property
                </Link>
            </div>

            <div className="grid gap-4">
                {properties.map((property) => (
                    <Link
                        key={property.id}
                        to={`/dashboard/properties/${property.id}`}
                        className="block bg-white border rounded-lg p-4 hover:border-blue-400 transition-colors"
                    >
                        <h3 className="font-semibold text-gray-900">{property.name}</h3>
                        <p className="text-sm text-gray-600">{property.address}</p>
                        <p className="text-xs text-gray-400 mt-1">{property.timezone}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
}