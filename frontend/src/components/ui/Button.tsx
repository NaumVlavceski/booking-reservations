import type {ComponentPropsWithRef, ReactNode} from "react";
import {Link, type LinkProps} from "react-router-dom";
import {buttonClass, type ButtonStyleProps} from "./buttonStyles";
import Spinner from "./Spinner";

interface ButtonProps extends ComponentPropsWithRef<"button">, ButtonStyleProps {
    /** Shows a spinner, swaps the label for `loadingLabel` (if given) and disables the button. */
    loading?: boolean;
    loadingLabel?: string;
    icon?: ReactNode;
}

export default function Button({
    variant, size, block, loading = false, loadingLabel, icon, className = "", children, disabled, type = "button", ...rest
}: ButtonProps) {
    return (
        <button
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={buttonClass({variant, size, block}, className)}
            {...rest}
        >
            {loading ? <Spinner/> : icon}
            {loading && loadingLabel ? loadingLabel : children}
        </button>
    );
}

interface ButtonLinkProps extends LinkProps, ButtonStyleProps {
    icon?: ReactNode;
}

/** A router link styled as a button. */
export function ButtonLink({variant, size, block, icon, className = "", children, ...rest}: ButtonLinkProps) {
    return (
        <Link className={buttonClass({variant, size, block}, className)} {...rest}>
            {icon}
            {children}
        </Link>
    );
}
