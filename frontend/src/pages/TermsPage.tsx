import {Link} from "react-router-dom";
import LegalLayout, {LegalList, LegalSection, Placeholder} from "../components/LegalLayout";
import {LEGAL_VERSIONS} from "../legal/versions";

// DRAFT text written from what the code actually does (see the security pass notes). Everything in a Placeholder
// must be filled in, and the whole text reviewed by a qualified person, before launch.

export default function TermsPage() {
    return (
        <LegalLayout
            title="Terms of Service"
            version={LEGAL_VERSIONS.terms}
            summary={
                <p>
                    The agreement between you and RoomTrack when you use it: what RoomTrack does and doesn't promise,
                    what you are responsible for, and how we handle your guests' details for you.
                </p>
            }
        >
            <LegalSection id="agreement" title="1. The agreement">
                <p>
                    These terms are an agreement between you and <Placeholder>OPERATOR NAME AND ADDRESS</Placeholder>{" "}
                    ("we"), which runs RoomTrack. By creating an account you accept them, together with the{" "}
                    <Link to="/privacy" className="link">Privacy Policy</Link>. If you use RoomTrack for a business, you
                    accept them for that business and confirm you may do so.
                </p>
            </LegalSection>

            <LegalSection id="account" title="2. Your account">
                <LegalList>
                    <li>You must be an adult and give a real name and an email address you control.</li>
                    <li>
                        Keep your password to yourself. You are responsible for what happens in your account, so tell
                        us at <Placeholder>CONTACT EMAIL</Placeholder> if you think someone else has used it.
                    </li>
                    <li>
                        Keep your calendar links private. Anyone who has a room's link can see its booked dates and the
                        guest names on your own bookings.
                    </li>
                </LegalList>
            </LegalSection>

            <LegalSection id="service" title="3. What RoomTrack does, and its limits">
                <p>
                    RoomTrack keeps the bookings of your rooms in one calendar. If you connect Booking.com, RoomTrack
                    and Booking.com exchange calendars through calendar links:
                </p>
                <LegalList>
                    <li>
                        RoomTrack reads Booking.com's calendar about every 10 minutes, and Booking.com reads RoomTrack's
                        calendar on its own schedule. So a booking made on one side is <strong>not</strong> blocked on
                        the other side at once, and two guests can book the same dates in the meantime.
                    </li>
                    <li>
                        A calendar link can stop working (for example if it is changed on Booking.com). RoomTrack shows
                        sync problems and double bookings it finds, and emails you about them if notifications are on,
                        but it cannot prevent every one.
                    </li>
                    <li>
                        Booking.com's calendar only shares dates and a short title: no prices or guest contact details.
                        Check important bookings on Booking.com itself.
                    </li>
                </LegalList>
                <p>
                    Earnings overviews and exports add up the amounts you enter. They are a help for your own records,
                    not accounting or tax advice.
                </p>
            </LegalSection>

            <LegalSection id="your-responsibilities" title="4. What you are responsible for">
                <LegalList>
                    <li>Using RoomTrack lawfully, and only for managing your own or your clients' accommodation.</li>
                    <li>
                        The details you enter about guests. You must have a lawful reason to store them and tell your
                        guests about it, as data protection law requires.
                    </li>
                    <li>
                        Not entering more than the booking needs. In particular, do not put identity document numbers,
                        payment card details or health information in names or notes.
                    </li>
                    <li>
                        Not trying to access other accounts, overload the service, get around its limits or copy it.
                    </li>
                </LegalList>
            </LegalSection>

            <LegalSection id="guest-data" title="5. How we handle your guests' details for you">
                <p>
                    For the guest details in your account, you are the controller and we are your processor. We
                    agree to:
                </p>
                <LegalList>
                    <li>process them only to provide RoomTrack to you, as you use it, and not for anything else;</li>
                    <li>keep them confidential, and make sure anyone who can access them is bound to confidentiality;</li>
                    <li>
                        protect them with the measures described in the{" "}
                        <Link to="/privacy#security" className="link">Privacy Policy</Link>;
                    </li>
                    <li>
                        only use the providers listed in the{" "}
                        <Link to="/privacy#who-processes" className="link">Privacy Policy</Link>, and tell you before
                        adding or replacing one, so you can object;
                    </li>
                    <li>help you answer your guests' requests to see, correct or delete their details;</li>
                    <li>tell you without undue delay if a breach affects them;</li>
                    <li>
                        delete them when you delete them, erase them from a booking, or delete your account (backups as
                        described in the Privacy Policy);
                    </li>
                    <li>give you the information you need to show that these commitments are kept.</li>
                </LegalList>
                <p><Placeholder>DECIDE WHETHER A SEPARATE DATA PROCESSING AGREEMENT IS OFFERED</Placeholder></p>
            </LegalSection>

            <LegalSection id="price" title="6. Price">
                <p><Placeholder>PRICING: FREE, OR PLANS, PAYMENT AND REFUND TERMS</Placeholder></p>
            </LegalSection>

            <LegalSection id="availability" title="7. Availability and changes to RoomTrack">
                <p>
                    We work to keep RoomTrack available and your data safe, but we cannot promise it will always be
                    available or free of errors. We may need maintenance, and we may change or remove features. If a
                    change takes away something important to you, we will tell you in advance where we can.
                </p>
            </LegalSection>

            <LegalSection id="ending" title="8. Ending the agreement">
                <LegalList>
                    <li>
                        You can stop at any time with "Delete my account" in your account settings. Download your data
                        first if you want to keep it, and remove RoomTrack's calendar links from Booking.com: they stop
                        working once the account is deleted.
                    </li>
                    <li>
                        We may suspend or close an account that seriously or repeatedly breaks these terms, or puts the
                        service or other people at risk. Unless the law or the risk prevents it, we will tell you first
                        and give you a chance to download your data.
                    </li>
                </LegalList>
            </LegalSection>

            <LegalSection id="liability" title="9. Liability">
                <p>
                    RoomTrack is provided as it is. To the extent the law allows, we are not liable for indirect losses
                    or lost income, including from double bookings or bookings missed because a calendar sync was
                    late or failed. <Placeholder>LIABILITY CAP</Placeholder>. Nothing in these terms limits liability
                    that cannot be limited by law.
                </p>
            </LegalSection>

            <LegalSection id="changes" title="10. Changes to these terms">
                <p>
                    The version and date at the top show when these terms last changed. If we change them in a way that
                    matters to you, we will tell you in RoomTrack or by email and ask you to accept the new version
                    before you continue.
                </p>
            </LegalSection>

            <LegalSection id="law" title="11. Law and disputes">
                <p><Placeholder>GOVERNING LAW AND COURTS</Placeholder></p>
            </LegalSection>

            <LegalSection id="contact" title="12. Contact">
                <p>
                    <Placeholder>OPERATOR NAME AND ADDRESS</Placeholder>
                    <br/>
                    <Placeholder>CONTACT EMAIL</Placeholder>
                </p>
            </LegalSection>
        </LegalLayout>
    );
}
