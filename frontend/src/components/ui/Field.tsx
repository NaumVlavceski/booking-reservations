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
    id?: string;
    className?: string;
    /** Keep the label for screen readers only (the context already says what the field is). */
    labelHidden?: boolean;
    /** The control always shows something (a select, a read-only value), so the label stays on the border. */
    floated?: boolean;
    /** An icon is drawn inside the left edge of the control; the resting label starts after it. */
    leadingIcon?: boolean;
    children: (control: FieldControlProps) => ReactNode;
}

/**
 * Outlined field: the label rests inside the box and floats onto the top-left border when the field is
 * focused or filled. Label, control, error and hint are wired together for assistive technology.
 */
export default function Field({label, hint, error, id, className, labelHidden, floated, leadingIcon, children}: FieldProps) {
    const autoId = useId();
    const controlId = id ?? autoId;
    const hintId = `${controlId}-hint`;
    const errorId = `${controlId}-error`;
    const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
    const control = {id: controlId, "aria-describedby": describedBy, "aria-invalid": error ? true as const : undefined};

    return (
        <div className={className}>
            {labelHidden ? (
                <>
                    <label htmlFor={controlId} className="sr-only">{label}</label>
                    {children(control)}
                </>
            ) : (
                <div className={`float-field ${floated ? "is-floated" : ""} ${leadingIcon ? "float-field--icon" : ""}`}>
                    {children(control)}
                    <label htmlFor={controlId} className="float-label">{label}</label>
                </div>
            )}
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

type BaseFieldProps = Omit<FieldProps, "children" | "id" | "floated" | "leadingIcon">;

// A placeholder is what tells CSS the field is empty (:placeholder-shown), so every control gets one.
export function TextField({label, hint, error, labelHidden, className, id, ...input}: BaseFieldProps & ComponentPropsWithRef<"input">) {
    return (
        <Field label={label} hint={hint} error={error} labelHidden={labelHidden} className={className} id={id}>
            {(control) => <input className="field-input" {...input} placeholder={input.placeholder || " "} {...control}/>}
        </Field>
    );
}

export function TextAreaField({label, hint, error, labelHidden, className, id, ...textarea}: BaseFieldProps & ComponentPropsWithRef<"textarea">) {
    return (
        <Field label={label} hint={hint} error={error} labelHidden={labelHidden} className={className} id={id}>
            {(control) => <textarea className="field-input" {...textarea} placeholder={textarea.placeholder || " "} {...control}/>}
        </Field>
    );
}

export function SelectField({label, hint, error, labelHidden, className, id, children, ...select}: BaseFieldProps & ComponentPropsWithRef<"select">) {
    return (
        <Field label={label} hint={hint} error={error} labelHidden={labelHidden} className={className} id={id} floated>
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
