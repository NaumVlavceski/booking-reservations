export type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet" | "danger" | "danger-ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonStyleProps {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Full width. */
    block?: boolean;
}

/** Class names for anything that looks like a button (a <button>, a router <Link>, an <a>). */
export function buttonClass({variant = "primary", size = "md", block = false}: ButtonStyleProps = {}, extra = ""): string {
    return [
        "btn",
        `btn-${variant}`,
        size === "md" ? "" : `btn-${size}`,
        block ? "w-full" : "",
        extra,
    ].filter(Boolean).join(" ");
}
