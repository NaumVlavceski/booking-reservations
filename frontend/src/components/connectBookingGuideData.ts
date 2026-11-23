// Data shared by ConnectBookingGuide (both help pages) and src/prerender.tsx (the build check). Kept out of the
// component file so that file only exports components (fast refresh).

/** The sentence under the page title, on both help pages. */
export const GUIDE_INTRO =
    "Keep all your channels on a single calendar, so that a booking on one platform automatically blocks those dates on the others. It takes about 5 minutes per room.";

export interface Picture {
    file: string;
    alt: string;
    /**
     * Only for the signed-in guide: the public page leaves it out and the build fails if it appears there. For a
     * screenshot that shows account data, e.g. a readable calendar link. None is marked at the moment.
     */
    app?: boolean;
}

/** Step 4's screenshots of the RoomTrack app (shown on both guides; the calendar link is cut off or blurred). */
export const APP_SCREENSHOTS: Picture[] = [
    {file: "booking-2-export-copy.png", alt: "Copying the RoomTrack link in the room"},
    {file: "booking-3-export-paste.png", alt: "Pasting the RoomTrack link under Import calendar on Booking.com"},
];

/** Screenshots marked `app`: never on a public page (scripts/seoPlugin.ts checks it). */
export const APP_SCREENSHOT_FILES = APP_SCREENSHOTS.filter((image) => image.app).map((image) => image.file);
