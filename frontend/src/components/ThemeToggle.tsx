import {useTheme} from "../lib/theme";

/**
 * Small sun/moon switch for light and dark mode: the round knob slides to the sun (light) or the moon (dark).
 * The choice is saved for the signed-in account (in this browser); new accounts start light.
 * Its colours are fixed, not theme tokens, so it reads as "day" or "night" in either theme.
 */
export default function ThemeToggle({email, className = ""}: { email: string | undefined; className?: string }) {
    const [theme, setTheme] = useTheme(email);
    const dark = theme === "dark";
    return (
        <button
            type="button"
            role="switch"
            aria-checked={dark}
            aria-label="Dark mode"
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            disabled={!email}
            onClick={() => setTheme(dark ? "light" : "dark")}
            className={`group inline-flex shrink-0 items-center justify-center rounded-full p-1 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus disabled:opacity-50 ${className}`}
        >
            <span
                aria-hidden="true"
                className={`relative block h-7 w-[3.25rem] rounded-full border-[1.5px] transition-colors duration-300 ${
                    dark ? "border-[#6FA3CC] bg-[#0F3A5A]" : "border-[#A9CBE6] bg-[#DCEBF7]"
                }`}
            >
                {/* The side the knob is not on shows its icon faintly. */}
                <SunGlyph className={`absolute top-1/2 left-[6px] size-3.5 -translate-y-1/2 text-[#5B93C4] transition-opacity duration-300 ${dark ? "opacity-100" : "opacity-0"}`}/>
                <MoonGlyph className={`absolute top-1/2 right-[6px] size-3.5 -translate-y-1/2 text-[#5B93C4] transition-opacity duration-300 ${dark ? "opacity-0" : "opacity-100"}`}/>
                <span
                    className={`absolute top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full shadow-sm transition-[left,background-color] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] ${
                        dark ? "left-[calc(100%-1.25rem-3px)] bg-[#0B2433]" : "left-[3px] bg-white"
                    }`}
                >
                    {dark
                        ? <MoonGlyph className="size-3.5 text-[#DCEBF7]"/>
                        : <SunGlyph className="size-3.5 text-[#E8A317]"/>}
                </span>
            </span>
        </button>
    );
}

function SunGlyph({className}: { className: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
            <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>
            <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/>
        </svg>
    );
}

function MoonGlyph({className}: { className: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/>
        </svg>
    );
}
