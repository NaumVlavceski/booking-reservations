import {useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {apiErrorMessage} from "../lib/api/client";
import {getMoveOptions, moveReservation} from "../lib/api/reservations";
import Sheet from "./ui/Sheet";
import Button from "./ui/Button";
import Callout from "./ui/Callout";
import Spinner from "./ui/Spinner";
import {CheckIcon, MoveIcon} from "./icons";

interface MoveReservationDialogProps {
    open: boolean;
    reservationId: string;
    currentRoom?: string;
    /** The form has changes that are not saved; the move only uses what is saved. */
    hasUnsavedChanges?: boolean;
    onClose: () => void;
    onMoved: (roomName: string) => void;
}

/** Move a booking to another room of the same property. Only rooms that are free on its dates are offered. */
export default function MoveReservationDialog({open, reservationId, currentRoom, hasUnsavedChanges, onClose, onMoved}: MoveReservationDialogProps) {
    const queryClient = useQueryClient();
    const [selected, setSelected] = useState<string | null>(null);
    const {data: options, isLoading, isError, refetch} = useQuery({
        queryKey: ["reservations", "move-options", reservationId],
        queryFn: () => getMoveOptions(reservationId),
        enabled: open,
        gcTime: 0,
    });
    const mutation = useMutation({
        mutationFn: (unitId: string) => moveReservation(reservationId, unitId),
        onSuccess: async (_data, unitId) => {
            const name = options?.find((o) => o.unitId === unitId)?.name ?? "the new room";
            await queryClient.invalidateQueries({queryKey: ["reservations"]});
            onMoved(name);
        },
    });

    function close() {
        setSelected(null);
        mutation.reset();
        onClose();
    }

    return (
        <Sheet
            open={open}
            onClose={close}
            title="Move booking"
            description={currentRoom ? `Now in ${currentRoom}. Only rooms in the same property that are free on these dates are shown.` : undefined}
            icon={<span className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft"><MoveIcon size={20}/></span>}
            dismissible={!mutation.isPending}
            footer={
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" size="lg" onClick={close} disabled={mutation.isPending}>Cancel</Button>
                    <Button size="lg" disabled={!selected} loading={mutation.isPending} loadingLabel="Moving…"
                            onClick={() => selected && mutation.mutate(selected)}>
                        Move
                    </Button>
                </div>
            }
        >
            <div className="space-y-3">
                {hasUnsavedChanges && (
                    <Callout tone="warning">Unsaved changes in the form are not part of the move.</Callout>
                )}
                {mutation.isError && (
                    <Callout tone="danger" role="alert">{apiErrorMessage(mutation.error, "Couldn't move this booking.")}</Callout>
                )}
                {isLoading ? (
                    <div className="flex justify-center py-4"><Spinner/></div>
                ) : isError ? (
                    <Callout tone="danger" role="alert" action={<Button variant="secondary" onClick={() => refetch()}>Try again</Button>}>
                        Couldn't load the rooms.
                    </Callout>
                ) : options && options.length === 0 ? (
                    <p className="text-body text-muted">No other room in this property is free on these dates.</p>
                ) : (
                    <div role="radiogroup" aria-label="Move to" className="space-y-1">
                        {options?.map((o) => {
                            const active = selected === o.unitId;
                            return (
                                <button
                                    key={o.unitId}
                                    type="button"
                                    role="radio"
                                    aria-checked={active}
                                    onClick={() => setSelected(o.unitId)}
                                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-body font-medium transition-colors ${
                                        active ? "bg-primary-soft text-on-primary-soft" : "text-fg hover:bg-surface-hover"
                                    }`}
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
