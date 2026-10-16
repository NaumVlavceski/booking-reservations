// The logo image has padding around the artwork; crop to the artwork box (x 380-880, y 280-1000 of 1264px).
const CROP = { x: 380, y: 280, w: 500, h: 720, full: 1264 };

export default function AppLogo({ size = 56 }: { size?: number }) {
    const scale = size / CROP.h;
    return (
        <div
            role="img"
            aria-label="RoomTrack"
            className="shrink-0"
            style={{
                width: CROP.w * scale,
                height: size,
                backgroundImage: "url(/logo.png)",
                backgroundRepeat: "no-repeat",
                backgroundSize: `${CROP.full * scale}px ${CROP.full * scale}px`,
                backgroundPosition: `-${CROP.x * scale}px -${CROP.y * scale}px`,
            }}
        />
    );
}
