import type {PropertyRequest} from "../lib/api/properties";
import {MAX_ROOMS} from "../lib/propertyForm";
import {TextField} from "./ui/Field";

interface PropertyFieldsProps {
    form: PropertyRequest;
    onChange: (form: PropertyRequest) => void;
    /** Number of rooms to create with the property; leave out when editing (rooms are managed one by one then). */
    unitCount?: string;
    onUnitCountChange?: (value: string) => void;
    errors: Record<string, string | undefined>;
    recheck: (input: HTMLInputElement) => void;
}

/** Name, address and (for a new property) how many rooms — shared by the property form and the first-run setup. */
export default function PropertyFields({form, onChange, unitCount, onUnitCountChange, errors, recheck}: PropertyFieldsProps) {
    const withRooms = unitCount !== undefined;
    return (
        <>
            <TextField
                label="Name"
                id="name"
                name="name"
                value={form.name}
                onChange={(e) => {
                    onChange({...form, name: e.target.value});
                    recheck(e.target);
                }}
                required
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="next"
                placeholder="Property Name"
                error={errors.name}
            />
            <TextField
                label="Address"
                id="address"
                name="address"
                value={form.address}
                onChange={(e) => onChange({...form, address: e.target.value})}
                autoComplete="street-address"
                enterKeyHint={withRooms ? "next" : "done"}
                placeholder="Address ..."
            />
            {withRooms && (
                <TextField
                    label="Number of rooms"
                    id="unitCount"
                    name="unitCount"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MAX_ROOMS}
                    step={1}
                    value={unitCount}
                    onChange={(e) => {
                        onUnitCountChange?.(e.target.value);
                        recheck(e.target);
                    }}
                    required
                    enterKeyHint="done"
                    hint="Named Room 1, Room 2, … with space for 2 guests each. You can rename them anytime."
                    error={errors.unitCount}
                />
            )}
        </>
    );
}
