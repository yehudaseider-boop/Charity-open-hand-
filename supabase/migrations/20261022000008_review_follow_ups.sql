-- Follow-ups from the second review of 23/10/2026.
--
-- 1. A cause a charity has chosen can no longer be deleted out from under it. Before, deleting a cause also
--    silently removed it from every charity that had ticked it (Admin, Causes refuses first, but two actions
--    at once could slip past). The delete is now refused by the database itself.
-- 2. The "what one gift pays for" names cannot start with a digit (the form refuses it; this makes the database
--    refuse it too, so "30 meals" can never be shown as "30 30 meals").

alter table public.charity_categories drop constraint charity_categories_category_id_fkey;
alter table public.charity_categories add constraint charity_categories_category_id_fkey
  foreign key (category_id) references public.categories (id) on delete restrict;

alter table public.charities add constraint impact_unit_names_start_with_letter
  check ((impact_unit_one is null or impact_unit_one !~ '^\s*[0-9]') and (impact_unit_many is null or impact_unit_many !~ '^\s*[0-9]'));
