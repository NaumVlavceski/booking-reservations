// The one place that says which version of each legal document is current. Registration sends these and the
// backend stores them with the acceptance time (app_user.terms_version / privacy_version / terms_accepted_at),
// and /api/me returns what the signed-in account accepted.
//
// When you change the text of a document in a way people must agree to again, set its version to the date of
// the change (format YYYY-MM-DD; the backend checks it). Comparing these with /api/me is how a later
// "please accept the updated Terms" step can find the accounts that still have to.

export const LEGAL_VERSIONS = {
    terms: "2026-10-30",
    privacy: "2026-10-30",
} as const;

/** "30 October 2026" for "Last updated" lines. */
export function versionDate(version: string): string {
    const [year, month, day] = version.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-GB", {day: "numeric", month: "long", year: "numeric"});
}
