import {Link} from "react-router-dom";
import LegalLayout, {LegalList, LegalSection, Placeholder} from "../components/LegalLayout";
import {LEGAL_VERSIONS} from "../legal/versions";

// DRAFT text written from what the code actually does (see the security pass notes). Everything in a Placeholder
// must be filled in, and the whole text reviewed by a qualified person, before launch.

export default function PrivacyPolicyPage() {
    return (
        <LegalLayout
            title="Privacy Policy"
            version={LEGAL_VERSIONS.privacy}
            summary={
                <p>
                    What RoomTrack stores about you and your guests, why, who helps us run it, how long we keep it, and
                    what you can ask us to do with it. In short: we only keep what the calendar needs, we don't sell
                    data, we don't show ads and we don't track you.
                </p>
            }
        >
            <LegalSection id="who" title="1. Who we are">
                <p>
                    RoomTrack is run by <Placeholder>Naum Vlavcheski Ohrid</Placeholder>. You can reach us about
                    anything in this policy at <Placeholder>nvlavceski542@gmail.com</Placeholder>.
                </p>
                <p>
                    RoomTrack is a booking calendar for people who rent out rooms and apartments ("owners"). It plays
                    two roles:
                </p>
                <LegalList>
                    <li>
                        For <strong>your account</strong> (your name, email, password and settings) we decide how the
                        data is used, so we are its <strong>controller</strong>.
                    </li>
                    <li>
                        For <strong>your guests' details</strong> that you enter or import (names, contact details,
                        notes) <strong>you</strong> are the controller: they are your guests and your records. We store
                        and process that data only on your behalf, to run the calendar for you (we are your{" "}
                        <strong>processor</strong>). The <Link to="/terms#guest-data" className="link">Terms of
                        Service</Link> describe that arrangement.
                    </li>
                </LegalList>
            </LegalSection>

            <LegalSection id="what" title="2. What we store">
                <p><strong>Your account</strong></p>
                <LegalList>
                    <li>Full name, email address and, if you give it, a contact phone number.</li>
                    <li>
                        Your password, but only as a one-way hash (BCrypt). Nobody, including us, can read it back.
                    </li>
                    <li>
                        Account settings (time zone, whether booking notification emails are on), when you signed up,
                        when you last signed in, when you confirmed your email address, and which version of these
                        documents you accepted and when.
                    </li>
                </LegalList>
                <p><strong>Your properties and bookings</strong></p>
                <LegalList>
                    <li>Property names and addresses (which may be your own address), room names and capacities.</li>
                    <li>
                        Bookings: dates, room, status, where the booking came from, number of guests, prices and
                        amounts, and your notes.
                    </li>
                    <li>
                        Guest details you choose to enter: name, email address and phone number.
                    </li>
                </LegalList>
                <p><strong>Booking.com calendar sync</strong> (only if you connect it)</p>
                <LegalList>
                    <li>
                        The calendar link you paste from Booking.com. It contains a private key, so we keep it like a
                        password and never show it in logs.
                    </li>
                    <li>
                        About every 10 minutes we read that calendar and store each booking's dates, the title
                        Booking.com gives it (which may contain a guest's name) and a technical booking ID, so we can
                        spot changes, cancellations and double bookings.
                    </li>
                    <li>
                        Each room also has its own private calendar link that you give to Booking.com. It shows the
                        dates and guest name of the bookings you entered yourself, never contact details, prices or
                        notes.
                    </li>
                </LegalList>
                <p><strong>Emails and security</strong></p>
                <LegalList>
                    <li>
                        A log of the emails we send you (address, type, subject, whether delivery worked), so we can
                        help when an email doesn't arrive.
                    </li>
                    <li>
                        Sign-up and password-reset codes, stored only as hashes and only until they are used or expire.
                    </li>
                    <li>
                        Technical records when you use RoomTrack: your IP address, the time, the address of the page or
                        action and the result. These are used to keep the service running and to stop abuse. We make
                        sure they never contain passwords, codes, sign-in tokens, calendar keys or guest details.
                    </li>
                </LegalList>
            </LegalSection>

            <LegalSection id="why" title="3. Why we use it">
                <LegalList>
                    <li>
                        <strong>To provide RoomTrack to you</strong>: your account, your calendar, syncing, invoices
                        overviews and the emails the account needs (codes, password changes). This is necessary to
                        perform our agreement with you.
                    </li>
                    <li>
                        <strong>Booking notification emails</strong> (new, changed and cancelled bookings, sync
                        problems, double bookings). You can switch these off in RoomTrack or with the unsubscribe link
                        in every such email.
                    </li>
                    <li>
                        <strong>To keep RoomTrack secure</strong>: limiting repeated attempts, investigating abuse and
                        errors. This is our legitimate interest in running a safe service.
                    </li>
                    <li><strong>To meet legal obligations</strong>, where a law requires us to keep or hand over data.</li>
                </LegalList>
                <p>
                    We do not sell personal data, show advertising, use analytics or tracking tools, or make automated
                    decisions about you.
                </p>
            </LegalSection>

            <LegalSection id="who-processes" title="4. Who helps us run RoomTrack">
                <p>These providers process data for us, only to provide their service to RoomTrack:</p>
                <LegalList>
                    <li>
                        <strong>Resend</strong> (email delivery): receives the recipient address and the content of each
                        email we send. Booking notifications contain property and room names, dates and, when there is
                        one, the guest's name.
                    </li>
                    <li>
                        <strong>Netlify</strong>: hosts the RoomTrack web app and forwards calendar-link requests from
                        roomtrack.app to our server, so it sees IP addresses and the addresses requested.
                    </li>
                    <li>
                        <strong><Placeholder>DNS PROVIDER</Placeholder></strong>: runs the domain name system for
                        roomtrack.app and sees the IP addresses that look the domain up.
                    </li>
                </LegalList>
                <p>
                    <strong>Booking.com</strong> is not our provider: when you connect a room, you choose to exchange
                    calendars between your Booking.com account and RoomTrack. Booking.com's own privacy policy applies
                    to what it does with that data.
                </p>
                <p>
                    Resend and Netlify are based in the United States, so some data may be processed outside your
                    country. <Placeholder>TRANSFER SAFEGUARDS (for example the EU–US Data Privacy Framework or
                    standard contractual clauses)</Placeholder>.
                </p>
            </LegalSection>

            <LegalSection id="how-long" title="5. How long we keep it">
                <LegalList>
                    <li>
                        <strong>Your account, properties and bookings</strong>: until you delete them or delete your
                        account. Deleting your account takes effect immediately and cannot be undone.
                    </li>
                    <li>
                        <strong>Guest details</strong>: until you erase them from a booking, delete the booking, or
                        delete your account. Erasing a guest removes their name, contact details and notes and keeps
                        only the dates, room and amounts, for your records. Nothing is erased automatically.
                    </li>
                    <li><strong>Email log</strong>: 90 days.</li>
                    <li><strong>Sign-up and password-reset codes</strong>: at most 7 days (only as hashes).</li>
                    <li>
                        <strong>Records used to limit repeated attempts</strong> (IP addresses and typed email
                        addresses): kept in memory only, for at most one hour.
                    </li>
                    <li>
                        <strong>Server logs</strong>: kept in size-limited files that are overwritten as new entries come
                        in. <Placeholder>LOG RETENTION PERIOD</Placeholder>.
                    </li>
                    <li>
                        <strong>Backups</strong>: deleted data can remain in backups until they are replaced, for up to{" "}
                        <Placeholder>BACKUP RETENTION PERIOD</Placeholder>. Backups are only used to restore the service
                        after a failure.
                    </li>
                </LegalList>
            </LegalSection>

            <LegalSection id="security" title="6. How we protect it">
                <LegalList>
                    <li>All traffic is encrypted (HTTPS), and browsers are told to always use it.</li>
                    <li>Passwords, codes and password-reset tokens are stored only as hashes.</li>
                    <li>
                        Every request is checked against the signed-in account, so one account can never see or change
                        another account's data.
                    </li>
                    <li>Repeated sign-in, sign-up and code attempts are limited.</li>
                    <li>The database cannot be reached from the internet.</li>
                    <li>Logs leave out passwords, codes, sign-in tokens, calendar keys and guest details.</li>
                    <li>Only <Placeholder>WHO HAS SERVER ACCESS</Placeholder> can access the servers.</li>
                </LegalList>
                <p>No system is perfectly secure. If a breach affects your data, we will tell you without undue delay.</p>
            </LegalSection>

            <LegalSection id="storage" title="7. Cookies and storage on your device">
                <p>RoomTrack uses <strong>no cookies</strong> and no tracking. It does keep these in your browser:</p>
                <LegalList>
                    <li>Your sign-in token, so you stay signed in. It is removed when you log out or your session ends.</li>
                    <li>
                        A copy of your calendar (properties, rooms and bookings, including guest details), so you can
                        still look at it without a connection. It is removed when you log out or your session ends. On a
                        shared device, always log out.
                    </li>
                    <li>
                        Small preferences: light or dark theme, the last property you opened, which properties you
                        collapsed in the calendar, setup progress, whether you have seen the Booking.com notes, and when
                        the "install the app" tip was last shown.
                    </li>
                    <li>
                        For the current tab only: a note that your session expired and the page to return to after you
                        sign in again.
                    </li>
                    <li>
                        If you install RoomTrack as an app, your device keeps the app's own files so it opens quickly.
                        No booking data is stored that way.
                    </li>
                </LegalList>
            </LegalSection>

            <LegalSection id="rights" title="8. Your rights">
                <p>You can ask us to:</p>
                <LegalList>
                    <li>
                        <strong>see and get a copy</strong> of your data. "Download my data" in your account settings
                        gives you everything in your account as a file you can keep or move elsewhere;
                    </li>
                    <li><strong>correct</strong> it. Most of it you can edit yourself in RoomTrack;</li>
                    <li>
                        <strong>delete</strong> it. "Delete my account" in your account settings removes your account and
                        everything in it;
                    </li>
                    <li><strong>restrict</strong> or <strong>object to</strong> how we use it;</li>
                    <li><strong>stop booking notification emails</strong>, at any time.</li>
                </LegalList>
                <p>
                    Write to <Placeholder>CONTACT EMAIL</Placeholder>. We answer within one month. You also have the
                    right to complain to a data protection authority, in particular{" "}
                    <Placeholder>DATA PROTECTION AUTHORITY AND ITS WEBSITE</Placeholder>.
                </p>
                <p>
                    <strong>If you are a guest</strong> of a RoomTrack owner, the owner decides about your data: please
                    contact them first. If you contact us, we will pass your request on to the owner and help them
                    answer it.
                </p>
            </LegalSection>

            <LegalSection id="children" title="9. Children">
                <p>RoomTrack is meant for adults running accommodation. It is not meant for children.</p>
            </LegalSection>

            <LegalSection id="changes" title="10. Changes to this policy">
                <p>
                    The version and date at the top show when this policy last changed. If we change it in a way that
                    matters to you, we will tell you in RoomTrack or by email and, where needed, ask you to accept the
                    new version.
                </p>
            </LegalSection>

            <LegalSection id="contact" title="11. Contact">
                <p>
                    <Placeholder>OPERATOR NAME AND ADDRESS</Placeholder>
                    <br/>
                    <Placeholder>CONTACT EMAIL</Placeholder>
                </p>
            </LegalSection>
        </LegalLayout>
    );
}
