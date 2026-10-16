import {useId, type ReactNode} from "react";
import {MinusIcon, PlusIcon} from "../icons";

interface StepperProps {
    label: string;
    value: number;
    onDecrement: () => void;
    onIncrement: () => void;
    decrementDisabled?: boolean;
    decrementLabel: string;
    incrementLabel: string;
}

/** − value + with 48px buttons; the value is announced when it changes. */
export function Stepper({label, value, onDecrement, onIncrement, decrementDisabled, decrementLabel, incrementLabel}: StepperProps) {
    const labelId = useId();
    return (
        <div className="flex items-center justify-between gap-4">
            <span id={labelId} className="text-body-sm font-semibold text-fg">{label}</span>
            <div role="group" aria-labelledby={labelId} className="inline-flex items-stretch overflow-hidden rounded-xl border border-strong bg-surface">
                <button type="button" onClick={onDecrement} disabled={decrementDisabled} aria-label={decrementLabel}
                        className="flex size-12 items-center justify-center text-fg transition-colors hover:bg-surface-hover active:bg-surface-pressed disabled:text-disabled disabled:hover:bg-transparent">
                    <MinusIcon size={18}/>
                </button>
                <output aria-live="polite" className="num flex min-w-12 items-center justify-center border-x border-default text-body font-semibold text-fg">
                    {value}
                </output>
                <button type="button" onClick={onIncrement} aria-label={incrementLabel}
                        className="flex size-12 items-center justify-center text-fg transition-colors hover:bg-surface-hover active:bg-surface-pressed">
                    <PlusIcon size={18}/>
                </button>
            </div>
        </div>
    );
}

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: ReactNode;
    icon?: ReactNode;
    disabled?: boolean;
    /** Smaller text and height, for the desktop sidebar. */
    compact?: boolean;
    className?: string;
}

/** On/off row: the whole row is the switch, 44px+ tall. */
export function Switch({checked, onChange, label, icon, disabled, compact = false, className = ""}: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`flex w-full items-center rounded-xl text-left font-medium text-fg transition-colors hover:bg-surface-hover disabled:opacity-60 ${compact ? "min-h-11 gap-2.5 px-3 text-body-sm text-muted" : "min-h-12 gap-3 px-3 text-body"} ${className}`}
        >
            {icon && <span className="text-muted">{icon}</span>}
            <span className="min-w-0 flex-1 whitespace-nowrap">{label}</span>
            <span
                aria-hidden="true"
                className={`relative shrink-0 rounded-full border transition-colors duration-200 ${compact ? "h-6 w-10" : "h-7 w-12"} ${
                    checked ? "border-primary bg-primary" : "border-strong bg-surface-sunken"
                }`}
            >
                <span className={`absolute top-0.5 left-0.5 rounded-full shadow-card transition-[translate] duration-200 ease-standard ${
                    compact ? "size-[1.125rem]" : "size-[1.375rem]"
                } ${
                    checked ? `${compact ? "translate-x-4" : "translate-x-5"} bg-on-primary` : "bg-[var(--rt-border-strong)]"
                }`}/>
            </span>
        </button>
    );
}
