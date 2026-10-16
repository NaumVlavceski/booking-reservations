import {useLocation} from "react-router-dom";
import {CompassIcon} from "../components/icons";
import {ButtonLink} from "../components/ui/Button";
import Card from "../components/ui/Card";

/** An address that doesn't exist (mistyped, or an old link). Signed-out visitors go to log in instead. */
export default function NotFoundPage() {
    const {pathname} = useLocation();
    return (
        <div className="pt-[env(safe-area-inset-top)]">
            <Card className="mx-auto mt-6 flex max-w-lg flex-col items-center gap-3 px-6 py-12 text-center sm:mt-12">
                <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-on-primary-soft">
                    <CompassIcon size={28}/>
                </span>
                <h1 className="text-title-1 text-fg">Page not found</h1>
                <p className="max-w-sm text-body-sm text-muted">
                    There's nothing at <span className="font-mono [overflow-wrap:anywhere] text-fg">{pathname}</span>. The
                    link may be old or mistyped.
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <ButtonLink to="/dashboard/calendar" size="lg">Go to calendar</ButtonLink>
                    <ButtonLink to="/dashboard/properties" variant="secondary" size="lg">Properties</ButtonLink>
                </div>
            </Card>
        </div>
    );
}
