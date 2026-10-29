import Callout from "./ui/Callout";

export default function ChannelSyncNotes() {
    return (
        <div className="space-y-3">
            <Callout tone="info" title="Channel bookings arrive within 10 minutes.">
                When a booking is made on Booking.com, it appears on your calendar within 10 minutes,
                or right away if you press the refresh button on the calendar. You also get an email when it
                arrives.
            </Callout>
            <Callout tone="warning" title="Direct bookings sync within 3 hours.">
                Dates you block in RoomTrack are automatically closed on Booking.com, but the update
                can take up to 3 hours to appear. To avoid double bookings, block the same dates directly on
                Booking.com right away.
            </Callout>
        </div>
    );
}
