#!/usr/bin/env python3
"""One Local database tool (standard library only).

Follows the OS repository's migration convention: numbered files `db/migrations/NNNN_name.sql`,
each recorded in `public.schema_migrations (name, applied_at)` once applied.

Production is READ-ONLY here, through the Supabase Management API read-only endpoint and the
SUPABASE_ACCESS_TOKEN in OL-ui/.env. Applying migrations to production is deliberately not a
command of this tool: it needs the founder's explicit approval (see CLAUDE.md).

Commands
  read "<sql>"        run a read-only query on production, print JSON
  tables              production tables with row counts
  status              which migration files are applied on production and locally
  snapshot            back up production public data + structure to backups/ (git-ignored)
  replica             write db/local/0000_os_replica.sql: the OS/POS tables One Local touches,
                      rebuilt from production's catalog (types, columns, constraints, functions)
  local-reset         recreate the local database: replica + migrations + pilot seed
  local-migrate       apply pending db/migrations to the local database
  local-seed          load the pilot restaurant (menu, staff logins) into the local database
  local-env           write frontend/.env.local and partner/.env.local pointing at local Supabase
  local-sql "<sql>"   run SQL on the local database
"""
import glob
import json
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / 'db' / 'migrations'
LOCAL = ROOT / 'db' / 'local'
BACKUPS = ROOT / 'backups'
LOCAL_DB_CONTAINER = 'supabase_db_onelocal-dev'

# OS/POS tables One Local and VINII Partner read or write. Everything else stays untouched.
REPLICA_TABLES = [
    'organizations', 'roles', 'org_users', 'org_counters', 'menu_categories', 'menu_items',
    'item_channel_status', 'channel_integrations', 'orders', 'order_items', 'order_events',
    'kot_tickets', 'payments', 'schema_migrations',
]
REPLICA_FUNCTIONS = ['set_updated_at', 'next_org_seq']
PILOT_ORG_SLUG = 'mysore-dining-hall'


# ---------- helpers ----------
def env():
    values = {}
    for line in (ROOT / '.env').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.split('=', 1)
            values[k.strip()] = v.strip().strip('"')
    return values


def project_ref():
    m = re.match(r'https://([a-z0-9]+)\.supabase\.co', env().get('SUPABASE_URL', ''))
    if not m:
        sys.exit('SUPABASE_URL missing in .env')
    return m.group(1)


def prod_read(sql):
    token = env().get('SUPABASE_ACCESS_TOKEN')
    if not token:
        sys.exit('SUPABASE_ACCESS_TOKEN missing in OL-ui/.env')
    req = urllib.request.Request(
        f'https://api.supabase.com/v1/projects/{project_ref()}/database/query/read-only',
        data=json.dumps({'query': sql}).encode(), method='POST',
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json', 'User-Agent': 'onelocal-db-tool'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def local_psql(sql, quiet=False):
    """Run SQL in the local Supabase database container as postgres."""
    p = subprocess.run(['docker', 'exec', '-i', LOCAL_DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres',
                        '-v', 'ON_ERROR_STOP=1', '-q', '-X', '-A', '-t'],
                       input=sql, text=True, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip() or p.stdout.strip())
    if not quiet:
        return p.stdout
    return ''


def local_json(sql):
    out = local_psql(f"select coalesce(json_agg(t), '[]') from ({sql}) t;")
    return json.loads(out.strip() or '[]')


def migration_files():
    return sorted(p for p in MIGRATIONS.glob('[0-9][0-9][0-9][0-9]_*.sql'))


def latest_backup():
    files = sorted(glob.glob(str(BACKUPS / 'production_public_*.json')))
    if not files:
        sys.exit('No backup found. Run: scripts/db.py snapshot')
    return json.load(open(files[-1]))


# ---------- production (read-only) ----------
def cmd_read(sql):
    print(json.dumps(prod_read(sql), indent=1, default=str))


def cmd_tables():
    rows = prod_read("select c.relname as table, c.reltuples::bigint as approx_rows from pg_class c "
                     "join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1")
    for r in rows:
        print(f"{r['table']:34s} {max(r['approx_rows'], 0)}")


def cmd_status():
    prod = {r['name'] for r in prod_read('select name from public.schema_migrations')}
    try:
        local = {r['name'] for r in local_json('select name from public.schema_migrations')}
    except Exception:
        local = None
    for f in migration_files():
        print(f"{f.name:48s} production: {'applied' if f.name in prod else 'PENDING'}   "
              f"local: {'-' if local is None else ('applied' if f.name in local else 'PENDING')}")
    print(f"\nproduction has {len(prod)} recorded migrations (latest: {max(prod) if prod else '-'})")


def cmd_snapshot():
    import datetime
    BACKUPS.mkdir(exist_ok=True)
    os.chmod(BACKUPS, 0o700)
    tables = [t['relname'] for t in prod_read(
        "select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1")]
    out = {'taken_at': datetime.datetime.now().strftime('%Y-%m-%d_%H%M'), 'project': project_ref(), 'data': {}}
    for t in tables:
        out['data'][t] = prod_read(f'select * from public."{t}"')
    out['structure'] = {
        'columns': prod_read("select table_name, column_name, data_type, udt_name, is_nullable, column_default, ordinal_position "
                             "from information_schema.columns where table_schema='public' order by table_name, ordinal_position"),
        'constraints': prod_read("select conrelid::regclass::text as table_name, conname, pg_get_constraintdef(oid) as definition "
                                 "from pg_constraint where connamespace='public'::regnamespace order by 1,2"),
        'indexes': prod_read("select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by 1,2"),
        'policies': prod_read("select tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname='public' order by 1,2"),
        'functions': prod_read("select p.proname, pg_get_functiondef(p.oid) as definition from pg_proc p "
                               "where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1"),
    }
    path = BACKUPS / f"production_public_{out['taken_at']}.json"
    path.write_text(json.dumps(out, indent=1, default=str))
    os.chmod(path, 0o600)
    print(f"saved {path.relative_to(ROOT)}: {len(tables)} tables, {sum(len(v) for v in out['data'].values())} rows")


# ---------- local replica ----------
def cmd_replica():
    names = ','.join(f"'{t}'" for t in REPLICA_TABLES)
    enums = prod_read(
        "select t.typname, json_agg(e.enumlabel order by e.enumsortorder) as labels from pg_type t "
        "join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace "
        f"where n.nspname='public' and t.typname in (select udt_name from information_schema.columns "
        f"where table_schema='public' and table_name in ({names}) and data_type='USER-DEFINED') group by 1 order by 1")
    cols = prod_read(
        "select table_name, column_name, udt_name, data_type, is_nullable, column_default, "
        "character_maximum_length, numeric_precision, numeric_scale from information_schema.columns "
        f"where table_schema='public' and table_name in ({names}) order by table_name, ordinal_position")
    cons = prod_read(
        "select conrelid::regclass::text as table_name, conname, contype, pg_get_constraintdef(oid) as def, "
        "confrelid::regclass::text as ref_table from pg_constraint "
        f"where connamespace='public'::regnamespace and conrelid::regclass::text in ({names}) order by contype desc, 1, 2")
    idx = prod_read(
        f"select indexname, indexdef from pg_indexes where schemaname='public' and tablename in ({names}) "
        "and indexname not in (select conname from pg_constraint where connamespace='public'::regnamespace)")
    fns = prod_read(
        "select p.proname, pg_get_functiondef(p.oid) as def from pg_proc p where p.pronamespace='public'::regnamespace "
        f"and p.proname in ({','.join(repr(f) for f in REPLICA_FUNCTIONS)})")
    arr = {'_text': 'text[]', '_uuid': 'uuid[]', '_int4': 'int4[]', '_int8': 'int8[]'}

    def coltype(c):
        u = c['udt_name']
        if u in arr:
            return arr[u]
        if u == 'numeric' and c['numeric_precision']:
            return f"numeric({c['numeric_precision']},{c['numeric_scale']})"
        if u == 'varchar' and c['character_maximum_length']:
            return f"varchar({c['character_maximum_length']})"
        return f'public.{u}' if c['data_type'] == 'USER-DEFINED' else u

    out = ['-- LOCAL DEVELOPMENT ONLY. Generated by scripts/db.py replica from production\'s catalog.',
           '-- A faithful copy of the OS/POS tables One Local touches, so code is tested against real',
           '-- column types and constraints. Never run this against production.', '']
    for e in enums:
        labels = ', '.join("'" + l.replace("'", "''") + "'" for l in e['labels'])
        out.append(f"do $$ begin create type public.{e['typname']} as enum ({labels}); exception when duplicate_object then null; end $$;")
    out.append('')
    by_table = {}
    for c in cols:
        by_table.setdefault(c['table_name'], []).append(c)
    for t in REPLICA_TABLES:
        lines = []
        for c in by_table.get(t, []):
            d = f"  {c['column_name']} {coltype(c)}"
            if c['column_default'] is not None:
                d += f" default {c['column_default']}"
            if c['is_nullable'] == 'NO':
                d += ' not null'
            lines.append(d)
        out.append(f'create table if not exists public.{t} (\n' + ',\n'.join(lines) + '\n);')
    out.append('')
    for f in fns:
        out.append(f['def'].strip() + ';')
    out.append('')
    # Primary keys and uniques/checks first, then foreign keys (only to replicated tables or auth.users).
    keep = set(REPLICA_TABLES)
    for c in cons:
        if c['contype'] == 'f':
            ref = (c['ref_table'] or '').replace('public.', '')
            if ref not in keep and ref != 'auth.users':
                continue
        out.append(f"alter table public.{c['table_name']} add constraint {c['conname']} {c['def']};")
    for i in idx:
        out.append(i['indexdef'].replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS').replace('CREATE UNIQUE INDEX', 'CREATE UNIQUE INDEX IF NOT EXISTS') + ';')
    out.append('')
    out.append('-- The server (service role) reads and writes these; RLS on as in production.')
    for t in REPLICA_TABLES:
        out.append(f'alter table public.{t} enable row level security;')
        out.append(f'grant all privileges on public.{t} to service_role;')
    LOCAL.mkdir(parents=True, exist_ok=True)
    path = LOCAL / '0000_os_replica.sql'
    path.write_text('\n'.join(out) + '\n')
    print(f'wrote {path.relative_to(ROOT)}: {len(REPLICA_TABLES)} tables, {len(enums)} enum types, {len(cons)} constraints, {len(fns)} functions')


def local_record(name):
    local_psql(f"insert into public.schema_migrations (name, applied_at) values ('{name}', now()) on conflict do nothing;", quiet=True)


def cmd_local_migrate():
    applied = {r['name'] for r in local_json('select name from public.schema_migrations')}
    pending = [f for f in migration_files() if f.name not in applied]
    if not pending:
        print('local database is up to date')
    for f in pending:
        local_psql(f.read_text(), quiet=True)
        local_record(f.name)
        print('applied locally:', f.name)


def cmd_local_seed():
    """Pilot restaurant from the latest production backup, plus two local-only test staff logins."""
    b = latest_backup()
    org = next(o for o in b['data']['organizations'] if o['slug'] == PILOT_ORG_SLUG)
    oid = org['id']

    def rows(table, pred=lambda r: r.get('organization_id') == oid):
        return [r for r in b['data'][table] if pred(r)]

    def insert(table, records):
        if not records:
            return
        cols = list(records[0].keys())
        values = []
        for r in records:
            vals = []
            for c in cols:
                v = r.get(c)
                if v is None:
                    vals.append('null')
                elif isinstance(v, (dict, list)):
                    vals.append("'" + json.dumps(v).replace("'", "''") + "'::jsonb" if isinstance(v, dict) or c in ('add_ons', 'config', 'settings', 'theme', 'meta') else "array[" + ','.join("'" + str(x).replace("'", "''") + "'" for x in v) + "]")
                elif isinstance(v, bool):
                    vals.append('true' if v else 'false')
                else:
                    vals.append("'" + str(v).replace("'", "''") + "'")
            values.append('(' + ','.join(vals) + ')')
        local_psql(f'insert into public.{table} ({",".join(cols)}) values {",".join(values)} on conflict do nothing;', quiet=True)

    safe_org = {k: v for k, v in org.items() if k not in ('created_by', 'onboarding_owner', 'source_lead_id')}
    insert('organizations', [safe_org])
    insert('roles', b['data']['roles'])
    insert('menu_categories', rows('menu_categories'))
    insert('menu_items', rows('menu_items'))
    insert('channel_integrations', rows('channel_integrations'))
    insert('org_counters', rows('org_counters'))
    # Local-only staff logins (never production accounts).
    import secrets as _s
    status = local_status()
    roles = {r['slug']: r['id'] for r in b['data']['roles']}
    for email, role in (('manager@pilot.local', 'manager'), ('kitchen@pilot.local', 'kitchen')):
        uid = local_create_user(status, email, 'pilot-test-123')
        insert('org_users', [{'organization_id': oid, 'user_id': uid, 'role_id': roles[role], 'email': email, 'full_name': role.title() + ' (test)', 'status': 'active'}])
    print(f"seeded pilot '{org['name']}': {len(rows('menu_categories'))} categories, {len(rows('menu_items'))} items; "
          'test logins manager@pilot.local / kitchen@pilot.local (password pilot-test-123, local only)')


def local_status():
    p = subprocess.run(['supabase', 'status', '-o', 'env'], cwd=ROOT, text=True, capture_output=True)
    if p.returncode != 0:
        sys.exit('Local Supabase is not running. Start it: cd OL-ui && supabase start')
    vals = {}
    for line in p.stdout.splitlines():
        if '=' in line:
            k, v = line.split('=', 1)
            vals[k.strip()] = v.strip().strip('"')
    return vals


def local_create_user(status, email, password):
    api, key = status['API_URL'], status['SERVICE_ROLE_KEY']
    body = json.dumps({'email': email, 'password': password, 'email_confirm': True}).encode()
    req = urllib.request.Request(f'{api}/auth/v1/admin/users', data=body, method='POST',
                                 headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)['id']
    except urllib.error.HTTPError as e:
        if e.code in (409, 422):  # already exists
            return local_json(f"select id from auth.users where email='{email}'")[0]['id']
        raise


def cmd_local_reset():
    replica = LOCAL / '0000_os_replica.sql'
    if not replica.exists():
        sys.exit('Run: scripts/db.py replica')
    names = ','.join(REPLICA_TABLES + ['ol_%'])
    drop = ("do $$ declare r record; begin for r in select tablename from pg_tables where schemaname='public' loop "
            "execute format('drop table if exists public.%I cascade', r.tablename); end loop; end $$;")
    local_psql(drop, quiet=True)
    local_psql(replica.read_text(), quiet=True)
    print('local replica created')
    cmd_local_migrate()
    cmd_local_seed()


def cmd_local_env():
    s = local_status()
    content = ('# LOCAL DEVELOPMENT: points the app and its API at the local Supabase (scripts/db.py local-env).\n'
               '# Delete this file to use production again.\n'
               f"SUPABASE_URL={s['API_URL']}\nSUPABASE_PUBLISHABLE_KEY={s['ANON_KEY']}\nSUPABASE_ANON_KEY={s['ANON_KEY']}\n"
               f"SUPABASE_SERVICE_ROLE_KEY={s['SERVICE_ROLE_KEY']}\nONELOCAL_DB_TARGET=local\n")
    for app in ('frontend', 'partner'):
        if (ROOT / app).exists():
            p = ROOT / app / '.env.local'
            p.write_text(content)
            os.chmod(p, 0o600)
            print('wrote', p.relative_to(ROOT))


def cmd_local_sql(sql):
    print(local_psql(sql))


if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] in ('-h', '--help', 'help'):
        print(__doc__)
        sys.exit(0)
    cmd, args = sys.argv[1], sys.argv[2:]
    handlers = {'read': lambda: cmd_read(args[0]), 'tables': cmd_tables, 'status': cmd_status, 'snapshot': cmd_snapshot,
                'replica': cmd_replica, 'local-reset': cmd_local_reset, 'local-migrate': cmd_local_migrate,
                'local-seed': cmd_local_seed, 'local-env': cmd_local_env, 'local-sql': lambda: cmd_local_sql(args[0])}
    if cmd not in handlers:
        sys.exit(f'unknown command {cmd}; see --help')
    handlers[cmd]()
