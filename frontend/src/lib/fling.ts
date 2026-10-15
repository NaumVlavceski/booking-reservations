export interface FlingTail {
    distance: number;
    durationMs: number;
}

export function flingTail(speedPxPerMs: number, tauMs: number, maxDistance: number): FlingTail {
    const speed = Math.abs(speedPxPerMs);
    if (speed < 1e-6) return {distance: 0, durationMs: 0};
    const distance = Math.min(speed * tauMs, maxDistance);
    return {distance: Math.sign(speedPxPerMs) * distance, durationMs: (2 * distance) / speed};
}

export function easeOutQuad(progress: number): number {
    const p = Math.min(1, Math.max(0, progress));
    return 1 - (1 - p) * (1 - p);
}
