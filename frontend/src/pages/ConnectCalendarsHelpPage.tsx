import PageHeader from "../components/ui/PageHeader";
import ConnectBookingGuide, {GuideJumpLinks} from "../components/ConnectBookingGuide";
import {GUIDE_INTRO} from "../components/connectBookingGuideData";
import {useReturnTo} from "../lib/useReturnTo";

/** The guide inside the app (signed in). The public copy is HelpConnectBookingPage; both render ConnectBookingGuide. */
export default function ConnectCalendarsHelpPage() {
    const {to: backTo, goBack} = useReturnTo("/dashboard/properties");

    return (
        <div className="space-y-8">
            <div>
                <PageHeader
                    title="Connect Booking.com"
                    back={{
                        to: backTo,
                        onClick: (e) => {
                            e.preventDefault();
                            goBack();
                        },
                    }}
                    description={GUIDE_INTRO}
                    alerts={false}
                />
                <GuideJumpLinks/>
            </div>

            <ConnectBookingGuide/>
        </div>
    );
}
