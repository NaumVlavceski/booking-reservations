import {useEffect, useRef, useState} from "react";

const DURATION_MS = 900;

function reducedMotion() {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Ease-out: fast at the start, settling gently on the final number. */
function easeOutCubic(t: number) {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * A number that counts up to `target`: from zero the first time it shows, then from the number on screen
 * whenever the target changes (e.g. new filters). With "reduce motion" on, it shows the target straight away.
 */
export function useCountUp(target: number, duration = DURATION_MS): number {
    const [value, setValue] = useState(0);
    const shown = useRef(0);

    useEffect(() => {
        if (reducedMotion()) return;
        const from = shown.current;
        let frame = 0;
        let start: number | null = null;
        function step(now: number) {
            start ??= now;
            const t = Math.min(1, (now - start) / duration);
            const next = t === 1 ? target : from + (target - from) * easeOutCubic(t);
            shown.current = next;
            setValue(next);
            if (t < 1) frame = requestAnimationFrame(step);
        }
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [target, duration]);

    return reducedMotion() ? target : value;
}

/**
 * A width in percent that grows from 0 to `percent` once mounted (a CSS transition does the animating;
 * "reduce motion" shortens it to nothing in index.css).
 */
export function useGrowFromZero(percent: number): number {
    const [grown, setGrown] = useState(false);
    useEffect(() => {
        // Two frames: the bar paints at 0 first, so the transition has somewhere to start from.
        let inner = 0;
        const outer = requestAnimationFrame(() => {
            inner = requestAnimationFrame(() => setGrown(true));
        });
        return () => {
            cancelAnimationFrame(outer);
            cancelAnimationFrame(inner);
        };
    }, []);
    return grown ? percent : 0;
}
