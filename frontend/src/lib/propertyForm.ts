import type {ValidationMessages} from "./useInlineValidation";

export const MAX_ROOMS = 200;

/** Field messages for PropertyFields (the property form and the first-run setup). */
export const PROPERTY_MESSAGES: ValidationMessages = {
    name: {valueMissing: "Enter a name for the property."},
    unitCount: {
        valueMissing: `Enter how many rooms it has (0 to ${MAX_ROOMS}).`,
        badInput: "Enter a whole number.",
        rangeUnderflow: "Enter 0 or more rooms.",
        rangeOverflow: `Enter at most ${MAX_ROOMS} rooms.`,
        stepMismatch: "Enter a whole number.",
    },
};
