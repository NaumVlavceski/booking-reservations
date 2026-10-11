import {describeSyncError} from "../lib/syncErrors";

/** A failing channel sync in plain words, with the raw error kept out of the way. */
export default function SyncProblem({error, platform}: { error: string | null; platform: string }) {
    const problem = describeSyncError(error, platform);
    return (
        <div className="rounded-xl bg-red-50 px-3.5 py-3 text-sm">
            <p className="font-semibold text-red-800">{problem.title}</p>
            <p className="mt-0.5 text-red-700">{problem.advice}</p>
            {error && (
                <details className="mt-2 text-xs text-red-700/80">
                    <summary className="cursor-pointer font-medium select-none">Technical details</summary>
                    <p className="mt-1 font-mono break-all">{error}</p>
                </details>
            )}
        </div>
    );
}
