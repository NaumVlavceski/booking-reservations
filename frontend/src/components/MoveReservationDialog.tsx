import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {errorMessage, errorReason} from "../lib/errors";
import {copyReservation, getAvailableOptions, moveReservation} from "../lib/api/reservations";
import Sheet from "./ui/Sheet";
import Button from "./ui/Button";
import Callout from "./ui/Callout";
import Spinner from "./ui/Spinner";
import {CheckIcon, CopyIcon, MoveIcon} from "./icons";

interface MoveReservationDialogProps {
    open: boolean;
    /** "move": pick one room. "copy": pick any number of rooms. */
    mode?: "move" | "copy";
    reservationId: string;
    currentRoom?: string;
    /** The form has changes that are not saved; move and copy only use what is saved. */
    hasUnsavedChanges?: boolean;
    /** Saves the form's changes in place; with it, the unsaved-changes notice offers a "Save changes" button. */
    onSaveChanges?: () => Promise<void>;
    onClose: () => void;
    /** Names of the room(s) the booking was moved or copied to. */
    onDone: (roomNames: string[]) => void;
}

/** Move or copy a booking to other rooms of the same property. Only rooms that are free on its dates are offered. */
export default function MoveReservationDialog({open, mode = "move", reservationId, currentRoom, hasUnsavedChanges, onSaveChanges, onClose, onDone}: MoveReservationDialogProps) {
    const isCopy = mode === "copy";
    const queryClient = useQueryClient();
    const [selected, setSelected] = useState<string[]>([]);
    const {data: options, isLoading, isError, error, refetch, isRefetching} = useQuery({
        queryKey: ["reservations", "available-options", reservationId],
        queryFn: () => getAvailableOptions(reservationId),
        enabled: open,
        gcTime: 0,
    });
    const mutation = useMutation({
        mutationFn: async (unitIds: string[]): Promise<unknown> => isCopy ? copyReservation(reservationId, unitIds) : moveReservation(reservationId, unitIds[0]),
        onSuccess: async (_data, unitIds) => {
            const names = unitIds.map((id) => options?.find((o) => o.unitId === id)?.name ?? "the new room");
            await queryClient.invalidateQueries({queryKey: ["reservations"]});
            onDone(names);
        },
    });

    // The dates may have changed, so the free rooms are reloaded after saving and the choice starts over.
    const saveMutation = useMutation({
        mutationFn: async () => {
            await onSaveChanges?.();
        },
        onSuccess: () => setSelected([]),
    });
    const busy = mutation.isPending || saveMutation.isPending;

    function close() {
        setSelected([]);
        mutation.reset();
        saveMutation.reset();
        onClose();
    }

    function toggle(unitId: string) {
        if (!isCopy) setSelected([unitId]);
        else setSelected((s) => s.includes(unitId) ? s.filter((id) => id !== unitId) : [...s, unitId]);
    }

    const allSelected = Boolean(options && options.length > 0 && selected.length === options.length);
    const rowClass = (active: boolean) => `flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-body font-medium transition-colors ${
        active ? "bg-primary-soft text-on-primary-soft" : "text-fg hover:bg-surface-hover"
    }`;
    const Icon = isCopy ? CopyIcon : MoveIcon;
    const confirmLabel = isCopy ? (selected.length > 1 ? `Copy to ${selected.length} rooms` : "Copy") : "Move";
    const rule = "Only rooms in the same property that are free on these dates are shown.";

    return (
        <Sheet
            open={open}
            onClose={close}
            title={isCopy ? "Copy booking" : "Move booking"}
            description={isCopy
                ? `${currentRoom ? `From ${currentRoom}. ` : ""}The booking is copied to each room you pick, without prices. ${rule}`
                : currentRoom ? `Now in ${currentRoom}. ${rule}` : undefined}
            icon={<span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft"><Icon size={20}/></span>}
            dismissible={!busy}
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" size="lg" onClick={close} disabled={busy}>Cancel</Button>
                    <Button size="lg" disabled={selected.length === 0 || saveMutation.isPending || hasUnsavedChanges} loading={mutation.isPending}
                            loadingLabel={isCopy ? "Copying…" : "Moving…"}
                            onClick={() => mutation.mutate(selected)}>
                        {confirmLabel}
                    </Button>
                </div>
            }
        >
            <div className="space-y-3">
                {hasUnsavedChanges && (
                    <Callout
                        tone="warning"
                        action={onSaveChanges && (
                            <Button variant="secondary" loading={saveMutation.isPending} loadingLabel="Saving…"
                                    onClick={() => saveMutation.mutate()}>
                                Save changes
                            </Button>
                        )}
                    >
                        You have unsaved changes. {onSaveChanges ? "Save them to continue" : `They are not part of the ${isCopy ? "copy" : "move"}`}.
                    </Callout>
                )}
                {saveMutation.isError && (
                    <Callout tone="danger" role="alert">{errorMessage(saveMutation.error, "Couldn't save the changes.")}</Callout>
                )}
                {mutation.isError && (
                    <Callout tone="danger" role="alert">{errorMessage(mutation.error, isCopy ? "Couldn't copy this booking." : "Couldn't move this booking.")}</Callout>
                )}
                {isLoading ? (
                    <div className="flex justify-center py-4"><Spinner/></div>
                ) : isError ? (
                    <Callout tone="danger" role="alert" title="Couldn't load the free rooms"
                             action={<Button variant="secondary" onClick={() => refetch()} loading={isRefetching} loadingLabel="Trying again…">Try again</Button>}>
                        {errorReason(error)}
                    </Callout>
                ) : options && options.length === 0 ? (
                    <p className="text-body text-muted">No other room in this property is free on these dates.</p>
                ) : (
                    <div role={isCopy ? "group" : "radiogroup"} aria-label={isCopy ? "Copy to" : "Move to"} className="space-y-1">
                        {isCopy && options && options.length > 1 && (
                            <button type="button" role="checkbox" aria-checked={allSelected}
                                    onClick={() => setSelected(allSelected ? [] : options.map((o) => o.unitId))}
                                    className={rowClass(allSelected)}>
                                <span className="min-w-0 flex-1 truncate">Select all</span>
                                {allSelected && <CheckIcon size={18} strokeWidth={2.5}/>}
                            </button>
                        )}
                        {options?.map((o) => {
                            const active = selected.includes(o.unitId);
                            return (
                                <button
                                    key={o.unitId}
                                    type="button"
                                    role={isCopy ? "checkbox" : "radio"}
                                    aria-checked={active}
                                    onClick={() => toggle(o.unitId)}
                                    className={rowClass(active)}
                                >
                                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                                    {active && <CheckIcon size={18} strokeWidth={2.5}/>}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </Sheet>
    );
}
