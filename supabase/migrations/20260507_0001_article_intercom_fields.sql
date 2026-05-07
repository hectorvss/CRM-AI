-- 20260507_0001_article_intercom_fields.sql
--
-- Adds the fields the new Intercom-style article editor exposes in its
-- right Información panel:
--   • Fin toggles (Servicio / Ventas / Copilot) + Audiencia
--   • Centro de ayuda visibility + collection + audience
--   • Excluir de sugerencias
--   • Etiquetas (tags)
--   • Informes (vistas, conversaciones, reacciones) — read-only counters
--
-- helpcenter_collection_id reuses knowledge_domains as the collection
-- catalogue (a "folder" and a "collection" are the same entity for this
-- workspace). No new table required.

begin;

alter table knowledge_articles
  add column if not exists fin_service               boolean not null default false,
  add column if not exists fin_sales                 boolean not null default false,
  add column if not exists copilot_enabled           boolean not null default true,
  add column if not exists fin_audience              jsonb   not null default '["users","leads","visitors"]'::jsonb,
  add column if not exists helpcenter_status         text    not null default 'draft',
  add column if not exists helpcenter_collection_id  uuid    null     references knowledge_domains(id) on delete set null,
  add column if not exists helpcenter_audience       jsonb   not null default '["users","leads","visitors"]'::jsonb,
  add column if not exists excluded_from_suggestions boolean not null default false,
  add column if not exists tags                      jsonb   not null default '[]'::jsonb,
  add column if not exists language                  text    not null default 'en',
  add column if not exists author_user_id            uuid    null     references users(id) on delete set null,
  add column if not exists description               text    null,
  add column if not exists view_count                integer not null default 0,
  add column if not exists conversation_count        integer not null default 0,
  add column if not exists reactions                 jsonb   not null default '{"happy":0,"neutral":0,"sad":0}'::jsonb;

comment on column knowledge_articles.fin_service               is 'Whether Fin is allowed to use this article when acting as the Service agent.';
comment on column knowledge_articles.fin_sales                 is 'Whether Fin is allowed to use this article when acting as the Sales agent.';
comment on column knowledge_articles.copilot_enabled           is 'Whether Copilot is allowed to surface this article to teammates.';
comment on column knowledge_articles.fin_audience              is 'Array of audience tokens (users/leads/visitors) Fin uses to gate this article.';
comment on column knowledge_articles.helpcenter_status         is 'draft | published — controls whether this article shows up on the help center.';
comment on column knowledge_articles.helpcenter_collection_id  is 'Optional knowledge_domains row this article belongs to as a help-center collection.';
comment on column knowledge_articles.helpcenter_audience       is 'Audience that can see this article on the help center.';
comment on column knowledge_articles.excluded_from_suggestions is 'When true Fin will never recommend this article in its suggestions list.';
comment on column knowledge_articles.tags                      is 'Free-form tag strings shown as chips in the editor.';
comment on column knowledge_articles.view_count                is 'Read-only counter; surface in the Informes panel.';
comment on column knowledge_articles.conversation_count        is 'Number of cases that cited this article. Read-only counter.';
comment on column knowledge_articles.reactions                 is '{ happy, neutral, sad } reaction tallies. Read-only counter.';

-- Indexes for the lookups the editor + listing pages run frequently.
create index if not exists idx_knowledge_articles_helpcenter_collection
  on knowledge_articles (tenant_id, workspace_id, helpcenter_collection_id);
create index if not exists idx_knowledge_articles_fin_flags
  on knowledge_articles (tenant_id, workspace_id, fin_service, fin_sales, copilot_enabled);

commit;
