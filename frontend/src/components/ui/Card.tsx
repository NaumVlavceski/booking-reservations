import type {ElementType, ReactNode} from "react";

interface CardProps {
    as?: ElementType;
    className?: string;
    children: ReactNode;
    /** Padding inside the card; "none" for lists whose rows bring their own. */
    padding?: "none" | "md";
    "aria-labelledby"?: string;
}

/** The one card style: surface, subtle outline, level-1 shadow, 16px radius. */
export default function Card({as: Tag = "div", className = "", children, padding = "md", ...rest}: CardProps) {
    return (
        <Tag
            className={`rounded-2xl border border-subtle bg-surface shadow-card ${padding === "md" ? "p-4 sm:p-5" : "overflow-hidden"} ${className}`}
            {...rest}
        >
            {children}
        </Tag>
    );
}

interface SectionCardProps {
    title: ReactNode;
    /** Right-hand side of the heading row: a count, a badge, a small action. */
    aside?: ReactNode;
    description?: ReactNode;
    id: string;
    className?: string;
    children: ReactNode;
}

/** A titled group of fields or details (a form section, a settings block). */
export function SectionCard({title, aside, description, id, className = "", children}: SectionCardProps) {
    return (
        <Card as="section" aria-labelledby={id} className={`space-y-4 ${className}`}>
            <div>
                <div className="flex items-center justify-between gap-3">
                    <h2 id={id} className="text-title-3 text-fg">{title}</h2>
                    {aside}
                </div>
                {description && <p className="mt-0.5 text-body-sm text-muted">{description}</p>}
            </div>
            {children}
        </Card>
    );
}
