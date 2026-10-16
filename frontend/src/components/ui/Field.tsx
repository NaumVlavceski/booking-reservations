import {useId, type ComponentPropsWithRef, type ReactNode} from "react";
import {AlertCircleIcon, ChevronDownIcon} from "../icons";

export interface FieldControlProps {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
}

interface FieldProps {
    label: ReactNode;
    hint?: ReactNode;
    /** Shown under the control in red and announced with it; also marks the control `aria-invalid`. */
    error?: ReactNode;
    optional?: boolean;
    id?: string;
    className?: string;
    /** Keep the label for screen readers only (the context already says what the field is). */
    labelHidden?: boolean;
    children: (control: FieldControlProps) => ReactNode;
}

/** Label + control + error + hint, wired together for assistive technology. */
export default function Field({label, hint, error, optional, id, className, labelHidden, children}: FieldProps) {
    const autoId = useId();
    const controlId = id ?? autoId;
    const hintId = `${controlId}-hint`;
    const errorId = `${controlId}-error`;
    const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

    return (
        <div className={className}>
            <label htmlFor={controlId} className={labelHidden ? "sr-only" : "field-label"}>
                {label}
                {optional && <span className="font-normal text-subtle"> (optional)</span>}
            </label>
            {children({id: controlId, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined})}
            {error && (
                <p id={errorId} className="field-error">
                    <AlertCircleIcon className="mt-0.5"/>
                    <span>{error}</span>
                </p>
            )}
            {hint && <p id={hintId} className="field-hint">{hint}</p>}
        </div>
    );
}

type BaseFieldProps = Omit<FieldProps, "children" | "id">;

export function TextField({label, hint, error, optional, labelHidden, className, id, ...input}: BaseFieldProps & ComponentPropsWithRef<"input">) {
    return (
        <Field label={label} hint={hint} error={error} optional={optional} labelHidden={labelHidden} className={className} id={id}>
            {(control) => <input className="field-input" {...input} {...control}/>}
        </Field>
    );
}

export function TextAreaField({label, hint, error, optional, labelHidden, className, id, ...textarea}: BaseFieldProps & ComponentPropsWithRef<"textarea">) {
    return (
        <Field label={label} hint={hint} error={error} optional={optional} labelHidden={labelHidden} className={className} id={id}>
            {(control) => <textarea className="field-input" {...textarea} {...control}/>}
        </Field>
    );
}

export function SelectField({label, hint, error, optional, labelHidden, className, id, children, ...select}: BaseFieldProps & ComponentPropsWithRef<"select">) {
    return (
        <Field label={label} hint={hint} error={error} optional={optional} labelHidden={labelHidden} className={className} id={id}>
            {(control) => (
                <div className="relative">
                    <select className="field-input appearance-none pr-11" {...select} {...control}>
                        {children}
                    </select>
                    <ChevronDownIcon size={18} className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-subtle"/>
                </div>
            )}
        </Field>
    );
}
