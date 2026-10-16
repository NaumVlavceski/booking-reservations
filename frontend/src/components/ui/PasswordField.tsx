import {useState, type ComponentPropsWithRef, type ReactNode} from "react";
import Field from "./Field";

interface PasswordFieldProps extends Omit<ComponentPropsWithRef<"input">, "type"> {
    label: ReactNode;
    hint?: ReactNode;
    error?: ReactNode;
}

/** Password input with a Show/Hide button, so a long password can be checked on a phone keyboard. */
export default function PasswordField({label, hint, error, id, className, ...input}: PasswordFieldProps) {
    const [visible, setVisible] = useState(false);
    return (
        <Field label={label} hint={hint} error={error} id={id} className={className}>
            {(control) => (
                <div className="relative">
                    <input
                        type={visible ? "text" : "password"}
                        className="field-input pr-20"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        {...input}
                        {...control}
                    />
                    <button
                        type="button"
                        onClick={() => setVisible((v) => !v)}
                        aria-pressed={visible}
                        aria-controls={control.id}
                        className="absolute top-1/2 right-1 flex min-h-10 -translate-y-1/2 items-center rounded-lg px-3 text-body-sm font-semibold text-primary hover:bg-primary-soft"
                    >
                        {visible ? "Hide" : "Show"}
                        <span className="sr-only"> password</span>
                    </button>
                </div>
            )}
        </Field>
    );
}
