import {useImperativeHandle, useRef, type Ref} from "react";

export const CODE_LENGTH = 6;

export interface CodeInputHandle {
    /** Puts the cursor in the first box. */
    focus: () => void;
}

interface CodeInputProps {
    /** One entry per box, "" when empty. */
    digits: string[];
    onChange: (next: string[]) => void;
    label: string;
    invalid?: boolean;
    disabled?: boolean;
    autoFocus?: boolean;
    ref?: Ref<CodeInputHandle>;
}

/** Six one-digit boxes for an emailed code: typing spills forward, Backspace steps back, a pasted code fills them all. */
export default function CodeInput({digits, onChange, label, invalid, disabled, autoFocus, ref}: CodeInputProps) {
    const inputs = useRef<(HTMLInputElement | null)[]>([]);

    useImperativeHandle(ref, () => ({focus: () => inputs.current[0]?.focus()}), []);

    function handleChange(index: number, value: string) {
        const typed = value.replace(/\D/g, "");
        if (typed === "") {
            onChange(digits.map((d, i) => (i === index ? "" : d)));
            return;
        }
        // Typing over a filled box, or a keyboard that sends several digits at once, spills forward
        const next = [...digits];
        let pos = index;
        for (const ch of typed) {
            if (pos >= CODE_LENGTH) break;
            next[pos++] = ch;
        }
        onChange(next);
        inputs.current[Math.min(pos, CODE_LENGTH - 1)]?.focus();
    }

    function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Backspace" && digits[index] === "" && index > 0) {
            e.preventDefault();
            onChange(digits.map((d, i) => (i === index - 1 ? "" : d)));
            inputs.current[index - 1]?.focus();
        } else if (e.key === "ArrowLeft" && index > 0) {
            inputs.current[index - 1]?.focus();
        } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
            inputs.current[index + 1]?.focus();
        }
    }

    function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
        if (!pasted) return;
        e.preventDefault();
        onChange(Array.from({length: CODE_LENGTH}, (_, i) => pasted[i] ?? ""));
        inputs.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
    }

    return (
        <div role="group" aria-label={label} className="flex justify-center gap-2 sm:gap-3">
            {digits.map((digit, i) => (
                <input
                    key={i}
                    ref={(el) => {
                        inputs.current[i] = el;
                    }}
                    value={digit}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={handlePaste}
                    onFocus={(e) => e.target.select()}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    autoFocus={autoFocus && i === 0}
                    aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
                    aria-invalid={invalid || undefined}
                    disabled={disabled}
                    className={`num h-14 w-11 min-w-0 rounded-xl border bg-surface text-center text-2xl font-semibold text-fg transition-[border-color,box-shadow] focus:ring-3 focus:outline-none disabled:bg-surface-sunken disabled:text-muted sm:w-12 ${
                        invalid
                            ? "border-danger ring-1 ring-danger focus:ring-danger/30"
                            : "border-strong focus:border-primary focus:ring-focus/30"
                    }`}
                />
            ))}
        </div>
    );
}
