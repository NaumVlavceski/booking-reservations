/** "Villa Ohrid" → "VO". Falls back to "RT" (RoomTrack) while a name is still loading. */
function initials(name: string | undefined): string {
    const words = (name?.trim() || "RoomTrack").split(/\s+/);
    return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
}

const SIZE = {
    sm: "size-9 text-caption",
    md: "size-11 text-body-sm",
} as const;

/**
 * A name's initials on a quiet neutral tile (a property, the signed-in person). Decorative: the name is
 * always written next to it, so screen readers skip it. Neutral on purpose: teal is kept for actions and selection.
 */
export default function Avatar({name, size = "md", className = ""}: { name: string | undefined; size?: keyof typeof SIZE; className?: string }) {
    return (
        <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-control bg-tile font-bold text-on-tile ${SIZE[size]} ${className}`}>
            {initials(name)}
        </span>
    );
}
