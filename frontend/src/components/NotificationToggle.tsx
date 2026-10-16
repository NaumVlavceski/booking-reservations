import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {getNotificationSettings, setNotificationsEnabled, type NotificationSettings} from "../lib/api/notifications";
import {apiErrorMessage} from "../lib/api/client";
import {useToast} from "../lib/toast";
import {BellIcon} from "./icons";
import {Switch} from "./ui/Controls";

const KEY = ["notifications", "settings"];

/** On/off switch for booking emails (new, changed, cancelled reservations, sync problems). */
export default function NotificationToggle({compact = false, className = ""}: { compact?: boolean; className?: string }) {
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

    return (
        <Switch
            checked={data?.enabled ?? false}
            onChange={(enabled) => mutation.mutate(enabled)}
            disabled={data === undefined || mutation.isPending}
            icon={<BellIcon size={compact ? 18 : 20}/>}
            compact={compact}
            label="Email notifications"
            className={className}
        />
    );
}
