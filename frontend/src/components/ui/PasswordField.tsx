import {useState, type ComponentPropsWithRef, type ReactNode} from "react";
import Field from "./Field";
import {EyeIcon, EyeOffIcon} from "../icons";

interface PasswordFieldProps extends Omit<ComponentPropsWithRef<"input">, "type"> {
    label: ReactNode;
    hint?: ReactNode;
    error?: ReactNode;
}

/**
 * Password input with an eye button to show/hide it, so a long password can be checked on a phone keyboard.
 * The button is skipped by Tab (so Tab goes straight to the next field) and doesn't take focus from the input on click.
 */
export default function PasswordField({label, hint, error, id, className, ...input}: PasswordFieldProps) {
    const [visible, setVisible] = useState(false);
    return (
        <Field label={label} hint={hint} error={error} id={id} className={className}>
            {(control) => (
                <div className="relative">
                    <input
                        type={visible ? "text" : "password"}
                        className="field-input pr-12"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        {...input}
                        placeholder={input.placeholder || " "}
                        {...control}
                    />
                    <button
                        type="button"
                        tabIndex={-1}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setVisible((v) => !v)}
                        aria-pressed={visible}
                        aria-controls={control.id}
                        aria-label={visible ? "Hide password" : "Show password"}
                        title={visible ? "Hide password" : "Show password"}
                        className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary"
                    >
                        {visible ? <EyeOffIcon size={20}/> : <EyeIcon size={20}/>}
                    </button>
                </div>
            )}
        </Field>
    );
}
