-- Folders & subfolders for the Knowledge Hub.
-- Adds self-referencing nesting (parent_id) + an emoji/icon per folder.
-- Applied live via the Supabase MCP (knowledge_domains_folders_nesting).

alter table public.knowledge_domains
  add column if not exists parent_id text references public.knowledge_domains(id) on delete cascade,
  add column if not exists icon text;

create index if not exists idx_knowledge_domains_parent
  on public.knowledge_domains(parent_id);
