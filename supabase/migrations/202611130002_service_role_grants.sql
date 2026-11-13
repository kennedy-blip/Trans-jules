-- RLS bypass does not grant SQL privileges. These must be explicit even if
-- a fresh Supabase project's default privileges happen to include them.
begin;
grant usage on schema public to service_role;
grant select, insert, update, delete on public.api_keys, public.model_configs,
 public.routing_rules, public.worker_nodes, public.request_logs, public.node_leases to service_role;
commit;
