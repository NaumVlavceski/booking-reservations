// public/logo-mark.png is the logo's artwork, cropped from the former 1264px logo.png (still in git history) and
// scaled to 111 x 168: 3x the default size, sharp on phone screens, 21 KB.
const RATIO = 111 / 168;

/** decorative: alt="" for places where the visible text "RoomTrack" sits right next to the logo (no double name). */
export default function AppLogo({ size = 56, decorative = false }: { size?: number; decorative?: boolean }) {
    return (
        <img
            src="/logo-mark.png"
            alt={decorative ? "" : "RoomTrack"}
            width={Math.round(size * RATIO)}
            height={size}
            decoding="async"
            className="block shrink-0"
        />
    );
}
