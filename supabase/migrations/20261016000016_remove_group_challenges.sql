-- Givezy: group challenges removed again (16/10/2026, Yehuda: "keep it simple for now and see if people
-- adopt the app"). The feature (20261016000015) was built and never used; nothing was ever given to a
-- challenge. Its code is in the history (commit d3cc3fd) if it comes back.

drop function public.charity_challenges(uuid);
drop function public.challenge_public(text, uuid);
alter table public.donations drop constraint donations_one_target;
alter table public.donations drop constraint donations_challenge_same_charity;
drop index public.donations_challenge;
alter table public.donations drop column challenge_id;
drop trigger challenges_running_limit on public.group_challenges;
drop function public.limit_running_challenges();
drop table public.group_challenges;
