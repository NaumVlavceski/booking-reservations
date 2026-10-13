import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {getNotificationSettings, setNotificationsEnabled, type NotificationSettings} from "../lib/api/notifications";
import {apiErrorMessage} from "../lib/api/client";
import {useToast} from "../lib/toast";
import {BellIcon} from "./icons";

const KEY = ["notifications", "settings"];

/** On/off switch for booking emails (new, changed, cancelled reservations, sync problems). */
export default function NotificationToggle({className = ""}: { className?: string }) {
    const queryClient = useQueryClient();
    const toast = useToast();
    const {data} = useQuery({queryKey: KEY, queryFn: getNotificationSettings, staleTime: Infinity});

    const mutation = useMutation({
        mutationFn: setNotificationsEnabled,
        // Flip instantly; roll back if the server says no
        onMutate: async (enabled) => {
            await queryClient.cancelQueries({queryKey: KEY});
            const previous = queryClient.getQueryData<NotificationSettings>(KEY);
            queryClient.setQueryData<NotificationSettings>(KEY, {enabled});
            return {previous};
        },
        onSuccess: ({enabled}) => {
            toast.show(enabled ? "Email notifications turned on." : "Email notifications turned off.");
        },
        onError: (error, _enabled, context) => {
            if (context?.previous) queryClient.setQueryData(KEY, context.previous);
            toast.show(apiErrorMessage(error, "Couldn't change notification settings. Try again."), {tone: "error"});
        },
    });

    const enabled = data?.enabled ?? false;

    return (
        <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={data === undefined || mutation.isPending}
            onClick={() => mutation.mutate(!enabled)}
            className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:opacity-60 ${className}`}
        >
            <BellIcon size={16}/>
            <span className="min-w-0 flex-1 text-left">Email notifications</span>
            <span
                aria-hidden="true"
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${enabled ? "bg-teal-500" : "bg-slate-600"}`}
            >
                <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${enabled ? "translate-x-4" : ""}`}/>
            </span>
        </button>
    );
}
