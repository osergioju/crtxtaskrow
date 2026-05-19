-- ─────────────────────────────────────────────────────────────────────────────
-- pipeline_snapshots
-- Estado atual conhecido de cada tarefa — usado para detectar mudanças de step.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists pipeline_snapshots (
  task_id     integer      primary key,
  pipeline_step text       not null,
  updated_at  timestamptz  not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- pipeline_history
-- Audit trail imutável de cada transição de pipeline.
-- entered_at: quando entrou no step. exited_at: quando saiu (null = ainda nesse step).
-- is_client_blocking: true = tempo parado aguardando cliente.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists pipeline_history (
  id                uuid         primary key default gen_random_uuid(),
  task_id           integer      not null,
  pipeline_step     text         not null,
  entered_at        timestamptz  not null,
  exited_at         timestamptz,
  is_client_blocking boolean     not null default false,
  created_at        timestamptz  not null default now()
);

create index if not exists idx_ph_task_id    on pipeline_history(task_id);
create index if not exists idx_ph_entered_at on pipeline_history(entered_at);
-- índice parcial só para entradas abertas — acelera a busca de "quem está parado agora"
create index if not exists idx_ph_open       on pipeline_history(task_id) where exited_at is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — leitura pública (anon key), escrita apenas via service role (server)
-- ─────────────────────────────────────────────────────────────────────────────
alter table pipeline_snapshots enable row level security;
alter table pipeline_history    enable row level security;

create policy "anon_select_snapshots"
  on pipeline_snapshots for select using (true);

create policy "anon_select_history"
  on pipeline_history for select using (true);
