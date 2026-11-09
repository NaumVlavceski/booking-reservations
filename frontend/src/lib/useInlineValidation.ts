import {useCallback, useState} from "react";

type ValidityKey = "valueMissing" | "typeMismatch" | "tooShort" | "tooLong" | "rangeUnderflow" | "rangeOverflow" | "stepMismatch" | "badInput" | "patternMismatch";

const ORDER: ValidityKey[] = ["valueMissing", "badInput", "typeMismatch", "tooShort", "tooLong", "rangeUnderflow", "rangeOverflow", "stepMismatch", "patternMismatch"];

export type ValidationMessages = Record<string, Partial<Record<ValidityKey, string>>>;

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/**
 * Inline field errors on top of the browser's own constraint validation: the rules stay where they were
 * (required, minLength, type="email", min/max on the inputs); only the way they're shown changes —
 * a message under the field instead of a browser bubble. Use with <form noValidate>.
 */
export function useInlineValidation(messages: ValidationMessages = {}) {
    const [errors, setErrors] = useState<Record<string, string>>({});
    // Server field messages for fields this form has no input for (shown in the form's error box instead).
    const [otherErrors, setOtherErrors] = useState<string[]>([]);

    const messageFor = useCallback((el: Control): string | null => {
        if (el.validity.valid) return null;
        const custom = messages[el.name] ?? {};
        for (const key of ORDER) {
            if (el.validity[key]) return custom[key] ?? el.validationMessage;
        }
        return el.validationMessage || null;
    }, [messages]);

    /** Checks every named control; shows the problems and focuses the first one. True when all is valid. */
    const validate = useCallback((form: HTMLFormElement): boolean => {
        const next: Record<string, string> = {};
        let first: Control | null = null;
        for (const el of Array.from(form.elements) as Control[]) {
            if (!el.name || !("validity" in el) || el.disabled) continue;
            const message = messageFor(el);
            if (message && !next[el.name]) {
                next[el.name] = message;
                first ??= el;
            }
        }
        setErrors(next);
        setOtherErrors([]);
        first?.focus();
        return first === null;
    }, [messageFor]);

    /** Re-check one field after it changes, but only if it is currently showing an error. */
    const recheck = useCallback((el: Control) => {
        setErrors((current) => {
            if (!current[el.name]) return current;
            const message = messageFor(el);
            const next = {...current};
            if (message) next[el.name] = message;
            else delete next[el.name];
            return next;
        });
    }, [messageFor]);

    const setError = useCallback((name: string, message: string | null) => {
        setErrors((current) => {
            const next = {...current};
            if (message) next[name] = message;
            else delete next[name];
            return next;
        });
    }, []);

    /** After the server rejects some fields: their messages go under those fields, and the first one gets focus. */
    const showServerErrors = useCallback((form: HTMLFormElement | null, fieldErrors: Record<string, string>) => {
        const shown: Record<string, string> = {};
        const other: string[] = [];
        let first: HTMLElement | null = null;
        for (const [name, message] of Object.entries(fieldErrors)) {
            const el = form?.elements.namedItem(name);
            if (el instanceof HTMLElement) {
                shown[name] = message;
                first ??= el;
            } else {
                other.push(message);
            }
        }
        setErrors((current) => ({...current, ...shown}));
        setOtherErrors(other);
        first?.focus();
    }, []);

    return {errors, validate, recheck, setError, showServerErrors, otherErrors};
}
