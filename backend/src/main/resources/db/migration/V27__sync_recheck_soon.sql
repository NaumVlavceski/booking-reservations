-- A booking went missing from the calendar's last read: the read that confirms the cancellation comes within a couple
-- of minutes instead of the usual ten (IcalSyncScheduler, IcalReconciler).
ALTER TABLE external_calendar ADD COLUMN recheck_soon BOOLEAN NOT NULL DEFAULT FALSE;
