import {describeSyncError} from "../lib/syncErrors";
import {AlertIcon} from "./icons";

/** A failing channel sync in plain words, with the raw error kept out of the way. */
export default function SyncProblem({error, platform}: { error: string | null; platform: string }) {
    const problem = describeSyncError(error, platform);
    return (
        <div className="flex items-start gap-3 rounded-xl border border-danger-line bg-danger-soft px-3.5 py-3 text-body-sm">
            <AlertIcon size={18} className="mt-0.5 shrink-0 text-danger"/>
            <div className="min-w-0 flex-1">
                <p className="font-semibold text-fg">{problem.title}</p>
                <p className="mt-0.5 text-muted">{problem.advice}</p>
                {error && (
                    <details className="mt-2 text-caption text-muted">
                        <summary className="inline-flex min-h-8 cursor-pointer items-center font-semibold text-fg select-none">Technical details</summary>
                        <p className="mt-1 font-mono break-all">{error}</p>
                    </details>
                )}
            </div>
        </div>
    );
}
