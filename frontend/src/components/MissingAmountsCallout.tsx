import {plural} from "../lib/plural";
import Callout from "./ui/Callout";
import {ButtonLink} from "./ui/Button";
import {ChevronRightIcon} from "./icons";

/** Warns that some bookings count as 0, with a button to the list of exactly those bookings. */
export default function MissingAmountsCallout({count, to}: { count: number; to: string }) {
    if (count <= 0) return null;
    return (
        <Callout
            tone="warning"
            title="Some bookings have no amount"
            className="mb-4"
            action={
                <ButtonLink to={to} variant="secondary" size="sm" className="min-h-10">
                    Show {plural(count, "booking")}
                    <ChevronRightIcon size={16}/>
                </ButtonLink>
            }
        >
            {plural(count, "booking")} without a total {count === 1 ? "is" : "are"} counted as 0, so earnings may be higher.
        </Callout>
    );
}
