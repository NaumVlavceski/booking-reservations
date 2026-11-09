-- When a booking's event first went missing from its feed, and in how many syncs in a row. A booking is only
-- cancelled after it has stayed missing for a while, so one bad feed can't cancel real bookings (IcalReconciler).
ALTER TABLE external_event ADD COLUMN missing_since TIMESTAMPTZ;
ALTER TABLE external_event ADD COLUMN missing_syncs INT NOT NULL DEFAULT 0;

-- An empty range overlaps nothing, so no_overlap can't see it, and reading one back breaks the calendar.
-- NOT VALID: applies to every new and changed row, without failing the deploy if an old row breaks the rule.
ALTER TABLE reservation ADD CONSTRAINT stay_not_empty
    CHECK (NOT isempty(stay_range) AND NOT lower_inf(stay_range) AND NOT upper_inf(stay_range)) NOT VALID;
