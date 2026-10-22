-- Only an approved charity may record gifts itself (EFT, cash, imports) (22/10/2026 security review).
--
-- A recorded gift lands in the donor's own history and tax pack, matched by email. Before this, a charity
-- still in draft (anyone can start an application) could record a gift with any person's email. The website
-- checks this too; the database is the last word, for every way a gift is written.

create or replace function public.guard_recorded_gift_charity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.charities c where c.id = new.charity_id and c.status = 'approved') then
    raise exception 'Only an approved charity can record gifts';
  end if;
  return new;
end $$;

drop trigger if exists donations_recorded_needs_approved on public.donations;
create trigger donations_recorded_needs_approved before insert on public.donations
  for each row when (new.gateway = 'recorded') execute function public.guard_recorded_gift_charity();
