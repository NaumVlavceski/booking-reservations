import {Link} from "react-router-dom";

/** "Privacy Policy · Terms of Service", small, under the log-in and register cards. */
export default function LegalLinks() {
    return (
        <p className="flex flex-wrap items-center justify-center gap-x-2 text-caption text-subtle">
            <Link to="/privacy" className="inline-flex min-h-11 items-center underline-offset-2 hover:text-fg hover:underline">
                Privacy Policy
            </Link>
            <span aria-hidden="true">·</span>
            <Link to="/terms" className="inline-flex min-h-11 items-center underline-offset-2 hover:text-fg hover:underline">
                Terms of Service
            </Link>
        </p>
    );
}
