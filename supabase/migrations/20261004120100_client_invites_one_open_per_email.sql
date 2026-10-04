-- One open invite per address.
--
-- createClientInvite already looks for an open invite before issuing a new
-- one, but two advisors inviting the same person in the same second would each
-- find none and each insert a row. Two live links for one address is how
-- someone signs up on the plan from the older email. The index makes the
-- second insert fail, and the server function turns that into a plain message.
--
-- "Open" means not yet used and not revoked. A used or revoked invite does not
-- block a fresh one.

create unique index if not exists client_invites_one_open_per_email
  on public.client_invites (lower(email))
  where accepted_at is null and revoked_at is null;
