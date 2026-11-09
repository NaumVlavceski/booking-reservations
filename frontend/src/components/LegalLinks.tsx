import {Link} from "react-router-dom";

/** Privacy Policy and Terms of Service, small, under the log-in and register cards. */
export default function LegalLinks() {
    return (
        <p className="flex flex-wrap items-center gap-x-5 text-caption text-subtle">
            <Link to="/privacy" className="inline-flex min-h-11 items-center underline-offset-2 hover:text-fg hover:underline">
                Privacy Policy
            </Link>
            <Link to="/terms" className="inline-flex min-h-11 items-center underline-offset-2 hover:text-fg hover:underline">
                Terms of Service
            </Link>
        </p>
    );
}
