-- Migration: Add ledger balance enforcement trigger
-- This deferred constraint trigger validates that all entries within a ledger transaction
-- sum to zero (credits - debits = 0), enforcing double-entry accounting at the DB level.
-- It fires at the end of a transaction (DEFERRABLE INITIALLY DEFERRED) so all entries
-- for a given transaction_id are present before validation.

CREATE OR REPLACE FUNCTION check_ledger_balance()
RETURNS TRIGGER AS $$
DECLARE
  net_amount NUMERIC;
BEGIN
  SELECT SUM(
    CASE WHEN direction = 'credit' THEN amount::numeric ELSE -amount::numeric END
  ) INTO net_amount
  FROM ledger_entries
  WHERE transaction_id = NEW.transaction_id;

  IF net_amount != 0 THEN
    RAISE EXCEPTION 'Ledger transaction is unbalanced: net = %', net_amount;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applied as a deferred constraint trigger so it only fires at COMMIT,
-- after all entries for the transaction have been inserted.
CREATE CONSTRAINT TRIGGER enforce_ledger_balance
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_ledger_balance();
