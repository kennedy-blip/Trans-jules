begin;
create extension if not exists pgcrypto;
create table public.api_keys (id uuid primary key default gen_random_uuid(), name text not null, key_hash text not null unique, prefix text not null, created_at timestamptz not null default now(), revoked_at timestamptz);
create table public.model_configs (id uuid primary key default gen_random_uuid(), name text not null, version integer not null, base_model text not null, system_prompt text not null default '', parameters jsonb not null default '{}', priority integer not null default 100, created_at timestamptz not null default now(), unique(name,version));
create table public.routing_rules (id uuid primary key default gen_random_uuid(), alias text not null, model_name text not null, task_pattern text not null default '', priority integer not null default 100, unique(alias,model_name,task_pattern));
create table public.worker_nodes (id uuid primary key default gen_random_uuid(), name text not null, url text not null unique, models text[] not null default '{}', priority integer not null default 100, max_concurrency integer not null default 1 check(max_concurrency between 1 and 32), last_heartbeat timestamptz not null default now(), vram_free_mb numeric, ram_free_mb numeric, queue_load integer not null default 0);
create table public.request_logs (id uuid primary key default gen_random_uuid(), api_key_id uuid references public.api_keys on delete set null, model text not null, provider text, node_id uuid references public.worker_nodes on delete set null, status integer not null, tokens integer not null default 0, ttft_ms integer, latency_ms integer not null, attempts jsonb not null default '[]', created_at timestamptz not null default now());
create index request_logs_created on public.request_logs(created_at desc);
create index node_heartbeat on public.worker_nodes(last_heartbeat);
create table public.node_leases (id uuid primary key default gen_random_uuid(), node_id uuid not null references public.worker_nodes on delete cascade, expires_at timestamptz not null default now()+interval '65 seconds');
create index leases_node on public.node_leases(node_id,expires_at);
-- RLS has no public policies: only server-side service_role can access control-plane tables.
alter table public.api_keys enable row level security;
alter table public.model_configs enable row level security;
alter table public.routing_rules enable row level security;
alter table public.worker_nodes enable row level security;
alter table public.request_logs enable row level security;
alter table public.node_leases enable row level security;
create function public.acquire_node(target uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare cap integer; lease uuid;
begin
 select max_concurrency into cap from worker_nodes where id=target and last_heartbeat>now()-interval '30 seconds' for update;
 if cap is null then return null; end if;
 delete from node_leases where node_id=target and expires_at<=now();
 if (select count(*) from node_leases where node_id=target)<cap then
 insert into node_leases(node_id) values(target) returning id into lease; return lease;
 end if;
 return null;
end $$;
create function public.create_model_version(config jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare result model_configs;
begin
 perform pg_advisory_xact_lock(hashtextextended(config->>'name',0));
 insert into model_configs(name,version,base_model,system_prompt,parameters,priority)
 values(config->>'name',(select coalesce(max(version),0)+1 from model_configs where name=config->>'name'),config->>'base_model',config->>'system_prompt',config->'parameters',(config->>'priority')::integer) returning * into result;
 return to_jsonb(result);
end $$;
create function public.usage_metrics() returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('requests',count(*),'tokens',coalesce(sum(tokens),0),'ttft_ms',coalesce(round(avg(ttft_ms)),0),'failovers',count(*) filter(where jsonb_array_length(attempts)>1)) from request_logs;
$$;
revoke all on function public.acquire_node(uuid), public.create_model_version(jsonb), public.usage_metrics() from public, anon, authenticated;
grant execute on function public.acquire_node(uuid), public.create_model_version(jsonb), public.usage_metrics() to service_role;
insert into model_configs(name,version,base_model,system_prompt,parameters,priority) values
 ('llama-fast',1,'llama3.2:3b','You are a helpful assistant.','{"temperature":0.7}',100),
 ('qwen-code',1,'qwen2.5-coder:7b','You are an expert software engineer.','{"temperature":0.2}',100),
 ('deepseek-reasoning',1,'deepseek-r1:7b','You are a careful reasoning assistant.','{"temperature":0.6}',100);
insert into routing_rules(alias,model_name) values('auto-fast','llama-fast'),('auto-code','qwen-code'),('auto-reasoning','deepseek-reasoning');
commit;
