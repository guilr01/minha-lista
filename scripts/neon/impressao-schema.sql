-- Impressão digital do schema (funções, colunas, restrições, políticas,
-- permissões, gatilhos, índices, RLS). Rodar no Neon e num banco local montado
-- por scripts/banco.mjs: os hashes precisam ser iguais. No Postgres 18 os NOT
-- NULL também viram restrição (contype n); compare-os à parte se as versões diferirem.
select 'funcoes' as parte, md5(string_agg(p.proname || ':' || md5(pg_get_functiondef(p.oid)), ',' order by p.proname)) as h, count(*) as n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('app','public')
union all
select 'colunas', md5(string_agg(table_schema||'.'||table_name||'.'||column_name||':'||data_type||':'||coalesce(column_default,'')||':'||is_nullable, ',' order by table_schema, table_name, column_name)), count(*)
  from information_schema.columns where table_schema in ('app','public','controle')
union all
select 'restricoes', md5(string_agg(conrelid::regclass::text||'.'||conname||':'||pg_get_constraintdef(oid), ',' order by conrelid::regclass::text, conname)), count(*)
  from pg_constraint where connamespace in (select oid from pg_namespace where nspname in ('app','public'))
union all
select 'politicas', md5(string_agg(tablename||'.'||policyname||':'||cmd||':'||array_to_string(roles,'+')||':'||coalesce(qual,'')||':'||coalesce(with_check,''), ',' order by tablename, policyname)), count(*)
  from pg_policies where schemaname = 'public'
union all
select 'permissoes', md5(string_agg(grantee||':'||table_schema||'.'||table_name||':'||privilege_type, ',' order by grantee, table_schema, table_name, privilege_type)), count(*)
  from information_schema.role_table_grants where grantee in ('anon','authenticated')
union all
select 'perm_colunas', md5(string_agg(grantee||':'||table_name||'.'||column_name||':'||privilege_type, ',' order by grantee, table_name, column_name, privilege_type)), count(*)
  from information_schema.column_privileges where grantee in ('anon','authenticated') and table_schema = 'public'
union all
select 'perm_funcoes', md5(string_agg(r.rolname||':'||p.proname, ',' order by r.rolname, p.proname)), count(*)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace cross join pg_roles r
  where n.nspname in ('app','public') and r.rolname in ('anon','authenticated') and has_function_privilege(r.oid, p.oid, 'execute')
union all
select 'gatilhos_indices', md5(string_agg(x, ',' order by x)), count(*) from (
  select tgrelid::regclass::text||'.'||tgname as x from pg_trigger where not tgisinternal
  union all select indexdef from pg_indexes where schemaname in ('app','public')) t
union all
select 'rls', md5(string_agg(relname||':'||relrowsecurity||relforcerowsecurity, ',' order by relname)), count(*)
  from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
union all
select 'migracoes', string_agg(nome, ',' order by nome), count(*) from controle.migracao
order by 1
