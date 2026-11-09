-- The "Erase guest details" feature was removed (owners clear the guest fields or delete the booking instead).
-- Only the erasure timestamps go with the column; no guest data is stored in it.
ALTER TABLE reservation DROP COLUMN IF EXISTS guest_erased_at;
