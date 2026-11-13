-- Run against an isolated PostgreSQL database after the initial migration.
-- Tests rollback all fixtures.
begin;
do $$
declare node uuid; first_lease uuid; next_lease uuid; result jsonb; n integer;
begin
 if not has_table_privilege('service_role','public.api_keys','SELECT,INSERT,UPDATE,DELETE') then raise exception 'Server table grants missing'; end if;
 if has_table_privilege('anon','public.api_keys','SELECT') or has_table_privilege('authenticated','public.api_keys','SELECT') then raise exception 'Private keys exposed'; end if;
 if (select count(*) from model_configs) <> 3 then raise exception 'Missing model seeds'; end if;
 if has_function_privilege('anon','public.acquire_node(uuid)','EXECUTE') then raise exception 'Anon can acquire admission'; end if;
 if has_function_privilege('authenticated','public.create_model_version(jsonb)','EXECUTE') then raise exception 'Non-admin can publish'; end if;
 if exists(select 1 from pg_class where oid in ('public.api_keys'::regclass,'public.model_configs'::regclass,'public.routing_rules'::regclass,'public.worker_nodes'::regclass,'public.request_logs'::regclass,'public.node_leases'::regclass) and not relrowsecurity) then raise exception 'Missing RLS'; end if;
 insert into worker_nodes(name,url,max_concurrency) values('test','https://worker.example/v1',1) returning id into node;
 first_lease := acquire_node(node);
 if first_lease is null then raise exception 'Healthy node denied'; end if;
 if acquire_node(node) is not null then raise exception 'Concurrency cap exceeded'; end if;
 update node_leases set expires_at=now()-interval '1 second' where id=first_lease;
 next_lease := acquire_node(node);
 if next_lease is null then raise exception 'Expired lease not reclaimed'; end if;
 update worker_nodes set last_heartbeat=now()-interval '31 seconds' where id=node;
 delete from node_leases where node_id=node;
 if acquire_node(node) is not null then raise exception 'Stale node admitted'; end if;
 result := create_model_version('{"name":"test","base_model":"weights","system_prompt":"hello","parameters":{"temperature":0.2},"priority":100}');
 if (result->>'version')::integer <> 1 then raise exception 'Wrong initial version'; end if;
 result := create_model_version('{"name":"test","base_model":"weights-v2","system_prompt":"new","parameters":{},"priority":100}');
 if (result->>'version')::integer <> 2 then raise exception 'Version not incremented'; end if;
 select count(*) into n from model_configs where name='test';
 if n <> 2 then raise exception 'Version history overwritten'; end if;
end $$;
rollback;
