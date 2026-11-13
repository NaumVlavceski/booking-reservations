import {formatEarnings} from "../lib/api/invoices";
import {useCountUp, useGrowFromZero} from "../lib/useCountUp";

/**
 * An amount that counts up from zero to the real figure. Screen readers get the final amount only (the
 * moving number is hidden from them); the currency code, when there is one, sits after it in smaller type.
 */
export function AnimatedAmount({value, currency, className = ""}: {
    value: number;
    currency: string | null;
    className?: string;
}) {
    const shown = useCountUp(value);
    const unit = currency && <span className="ml-1 text-[length:max(0.75rem,0.5em)] font-semibold text-muted">{currency}</span>;
    return (
        <span className={`num ${className}`}>
            <span className="sr-only">{formatEarnings(value, currency)}</span>
            {/* The final amount, invisible, holds the width so nothing beside it shifts while the number grows. */}
            <span aria-hidden="true" className="inline-grid justify-items-end">
                <span className="invisible col-start-1 row-start-1">{formatEarnings(value, null)}{unit}</span>
                <span className="col-start-1 row-start-1">{formatEarnings(shown, null)}{unit}</span>
            </span>
        </span>
    );
}

/** A thin progress bar that grows from zero to `percent` when it first shows, and glides on later changes. */
export function ShareBar({percent, className = ""}: { percent: number; className?: string }) {
    const width = useGrowFromZero(Math.max(0, Math.min(100, percent)));
    return (
        <span aria-hidden="true" className={`block h-1.5 overflow-hidden rounded-full bg-surface-sunken ${className}`}>
            <span className="block h-full rounded-full bg-primary transition-[width] duration-[900ms] ease-[cubic-bezier(0.33,1,0.68,1)]"
                  style={{width: `${width}%`}}/>
        </span>
    );
}
