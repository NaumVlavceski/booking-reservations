import type {ReactNode} from "react";
import {NavLink} from "react-router-dom";

interface Option<T extends string> {
    value: T;
    label: ReactNode;
    icon?: ReactNode;
}

interface SegmentedControlProps<T extends string> {
    name: string;
    value: T;
    options: readonly Option<T>[];
    onChange: (value: T) => void;
    /** Text for the group (visible label lives outside; this names the radiogroup). */
    label: string;
    labelId?: string;
}

/**
 * One-of-few choice as segments. Real radio inputs underneath, so arrow keys, form semantics and
 * screen readers work as for any radio group.
 */
export function SegmentedControl<T extends string>({name, value, options, onChange, label, labelId}: SegmentedControlProps<T>) {
    return (
        <div
            role="radiogroup"
            aria-label={labelId ? undefined : label}
            aria-labelledby={labelId}
            className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-subtle bg-surface-sunken p-1"
        >
            {options.map((option) => {
                const checked = option.value === value;
                return (
                    <label
                        key={option.value}
                        className={`relative flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 text-body-sm font-semibold transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                            checked
                                ? "bg-surface text-fg shadow-card ring-1 ring-[var(--rt-border)]"
                                : "text-muted hover:bg-surface-hover hover:text-fg"
                        }`}
                    >
                        <input
                            type="radio"
                            name={name}
                            value={option.value}
                            checked={checked}
                            onChange={() => onChange(option.value)}
                            className="sr-only"
                        />
                        {option.icon}
                        {option.label}
                    </label>
                );
            })}
        </div>
    );
}

interface NavOption {
    to: string;
    label: ReactNode;
    /** Shown after the label, e.g. a count bubble. */
    trailing?: ReactNode;
}

/** Two or three sibling pages switched like segments (e.g. Conflicts | Sync status). */
export function SegmentedNav({items, label}: { items: NavOption[]; label: string }) {
    return (
        <nav aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl border border-subtle bg-surface-sunken p-1">
            {items.map((item) => (
                <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    className={({isActive}) =>
                        `flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-body-sm font-semibold transition-colors duration-150 ${
                            isActive
                                ? "bg-surface text-fg shadow-card ring-1 ring-[var(--rt-border)]"
                                : "text-muted hover:bg-surface-hover hover:text-fg"
                        }`
                    }
                >
                    {item.label}
                    {item.trailing}
                </NavLink>
            ))}
        </nav>
    );
}
