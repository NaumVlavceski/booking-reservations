import {Link} from "react-router-dom";
import AppLogo from "../components/AppLogo";
import ConnectBookingGuide, {GuideJumpLinks} from "../components/ConnectBookingGuide";
import {GUIDE_INTRO} from "../components/connectBookingGuideData";
import {ButtonLink} from "../components/ui/Button";
import {DEMO_ENABLED} from "../lib/demo";

/**
 * The public copy of the Booking.com guide (/help/connect-booking-com): the same content as the signed-in help page
 * (ConnectBookingGuide), without account data or screenshots marked signed-in only, and with no API calls. The demo starts
 * from the home page, so "Try the demo" is a link there rather than a button that would call the API from here.
 */
export default function HelpConnectBookingPage() {
    return (
        <main className="min-h-dvh px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+3rem)] sm:px-6 sm:py-12">
            <div className="mx-auto w-full max-w-3xl space-y-8">
                <div>
                    <Link to="/" className="inline-flex min-h-11 items-center gap-2 text-title-3 font-bold text-fg">
                        <AppLogo size={28} decorative/>
                        RoomTrack
                    </Link>
                    <h1 className="mt-6 text-display text-fg">How to connect Booking.com to RoomTrack</h1>
                    <p className="mt-2 text-body text-muted">{GUIDE_INTRO}</p>
                    <div className="mt-5 flex flex-wrap gap-3">
                        {DEMO_ENABLED && <ButtonLink to="/">Try the demo</ButtonLink>}
                        <ButtonLink to="/register" variant={DEMO_ENABLED ? "secondary" : "primary"}>Create an account</ButtonLink>
                    </div>
                    <div className="mt-6">
                        <GuideJumpLinks/>
                    </div>
                </div>

                <ConnectBookingGuide appScreenshots={false}/>

                <nav aria-label="More from RoomTrack" className="flex flex-wrap justify-center gap-x-6 border-t border-subtle pt-6 text-body-sm text-muted">
                    <Link to="/" className="link inline-flex min-h-11 items-center">Home</Link>
                    <Link to="/privacy" className="link inline-flex min-h-11 items-center">Privacy Policy</Link>
                    <Link to="/terms" className="link inline-flex min-h-11 items-center">Terms of Service</Link>
                    <Link to="/contact" className="link inline-flex min-h-11 items-center">Contact</Link>
                </nav>
            </div>
        </main>
    );
}
