-- 20260506_0004_case_attachments_bucket.sql
--
-- Storage bucket for inbox attachments. Created as private (not public)
-- because the route serves signed URLs with a short TTL — clients should
-- never share storage paths directly.

begin;

insert into storage.buckets (id, name, public)
values ('case-attachments', 'case-attachments', false)
on conflict (id) do nothing;

commit;
