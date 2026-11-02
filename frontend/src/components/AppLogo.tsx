// public/logo-mark.png is the logo's artwork, cropped from the former 1264px logo.png (still in git history) and
// scaled to 111 x 168: 3x the default size, sharp on phone screens, 21 KB.
const RATIO = 111 / 168;

export default function AppLogo({ size = 56 }: { size?: number }) {
    return (
        <img
            src="/logo-mark.png"
            alt="RoomTrack"
            width={Math.round(size * RATIO)}
            height={size}
            decoding="async"
            className="block shrink-0"
        />
    );
}
