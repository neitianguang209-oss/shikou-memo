-- 思考メモのクラウド保存(Supabase プロジェクト gzayrjlhruhvklsidraw に適用済み: migration 20261007000654 shikou_memo_cloud_sync)
-- クラウド側が消えたときに作り直せるよう、適用した内容をそのまま残している。
--
-- 端末の中(IndexedDB)だけでなく、メモとタグを1件ずつクラウドにも持つ。
-- 端末のデータが消えても、アプリを開けば自動でここから戻る。
-- 何も本当には消さない: 削除は「消した印」を付けるだけで中身は残し、上書き前の版は履歴に残す。

create sequence if not exists public.shikou_memo_rev_seq;

create table if not exists public.shikou_memo_records (
  id          text primary key,
  kind        text not null check (kind in ('note', 'tag')),
  data        jsonb not null,
  deleted     boolean not null default false,
  updated_at  timestamptz not null,
  rev         bigint not null,
  device      text,
  received_at timestamptz not null default now()
);
create index if not exists shikou_memo_records_rev_idx on public.shikou_memo_records (rev);

create table if not exists public.shikou_memo_history (
  hid         bigserial primary key,
  id          text not null,
  kind        text not null,
  data        jsonb,
  deleted     boolean,
  updated_at  timestamptz,
  device      text,
  replaced_at timestamptz not null default now()
);
create index if not exists shikou_memo_history_id_idx on public.shikou_memo_history (id);

create table if not exists public.shikou_memo_secret (
  k text primary key,
  v text not null
);

-- 公開キーからは表を直接さわれない(読む・書く・消すはすべて下の関数経由)
alter table public.shikou_memo_records enable row level security;
alter table public.shikou_memo_history enable row level security;
alter table public.shikou_memo_secret  enable row level security;
revoke all on public.shikou_memo_records, public.shikou_memo_history, public.shikou_memo_secret from anon, authenticated;
revoke all on sequence public.shikou_memo_rev_seq, public.shikou_memo_history_hid_seq from anon, authenticated;

-- 変更を合流させる(新しい方を残す)。返り値は実際に反映した件数
create or replace function public.shikou_memo_apply(p_changes jsonb, p_device text)
returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  r jsonb;
  v_id text;
  v_kind text;
  v_deleted boolean;
  v_data jsonb;
  v_updated timestamptz;
  cur public.shikou_memo_records%rowtype;
  n integer := 0;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    return 0;
  end if;
  if jsonb_array_length(p_changes) > 5000 then
    raise exception 'too many changes';
  end if;

  -- 書き込みを1本ずつに並べる(rev の大小 = 確定した順番、にするため。差分の取りこぼしを防ぐ)
  perform pg_advisory_xact_lock(hashtext('shikou_memo_records'));

  for r in select value from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(r) <> 'object' then continue; end if;
    v_id := r->>'id';
    v_kind := r->>'kind';
    v_deleted := coalesce(r->>'deleted', 'false') = 'true';
    v_data := r->'data';
    begin
      v_updated := (r->>'updatedAt')::timestamptz;
    exception when others then
      continue;
    end;
    if v_id is null or v_id = '' or length(v_id) > 100
       or v_kind is null or v_kind not in ('note', 'tag')
       or v_updated is null then
      continue;
    end if;
    -- 時計が大きく進んだ端末の書き込みが、ずっと勝ち続けないように
    if v_updated > now() + interval '1 day' then
      v_updated := now();
    end if;
    if v_data is not null and (
         jsonb_typeof(v_data) <> 'object'
         or octet_length(v_data::text) > 200000
         or (v_data ? 'id' and v_data->>'id' <> v_id)) then
      v_data := null;
    end if;
    if not v_deleted then
      if v_data is null then continue; end if;
      if v_kind = 'note' and coalesce(btrim(v_data->>'body'), '') = '' then continue; end if;
      if v_kind = 'tag'  and coalesce(btrim(v_data->>'name'), '') = '' then continue; end if;
    end if;

    select * into cur from public.shikou_memo_records where id = v_id for update;
    if found then
      if cur.kind <> v_kind or v_updated <= cur.updated_at then
        continue;   -- こちらの方が古い(または同じ)ので何もしない
      end if;
      insert into public.shikou_memo_history (id, kind, data, deleted, updated_at, device)
        values (cur.id, cur.kind, cur.data, cur.deleted, cur.updated_at, cur.device);
      update public.shikou_memo_records set
        data        = coalesce(v_data, cur.data),   -- 消したメモも中身は残しておく
        deleted     = v_deleted,
        updated_at  = v_updated,
        rev         = nextval('public.shikou_memo_rev_seq'),
        device      = p_device,
        received_at = now()
      where id = v_id;
    else
      insert into public.shikou_memo_records (id, kind, data, deleted, updated_at, rev, device)
        values (v_id, v_kind, coalesce(v_data, '{}'::jsonb), v_deleted, v_updated,
                nextval('public.shikou_memo_rev_seq'), p_device);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 今の中身を、これまでの「まるごとの控え」と同じ形で組み立てる
create or replace function public.shikou_memo_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'version', 1,
    'exportedAt', to_jsonb(now()),
    'source', 'server',
    'notes', coalesce((
      select jsonb_agg(data order by data->>'createdAt', id)
      from public.shikou_memo_records where kind = 'note' and not deleted
    ), '[]'::jsonb),
    'tags', coalesce((
      select jsonb_agg(data order by
        case when jsonb_typeof(data->'order') = 'number' then (data->>'order')::numeric end nulls last, id)
      from public.shikou_memo_records where kind = 'tag' and not deleted
    ), '[]'::jsonb)
  );
$$;

-- まるごとの控え({notes, tags}) を 1件ずつの変更の形に直す
create or replace function public.shikou_memo_changes_from_snapshot(p_snap jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_catalog
as $$
  select coalesce(jsonb_agg(c), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', n->>'id', 'kind', 'note', 'deleted', false, 'data', n,
      'updatedAt', coalesce(n->>'updatedAt', n->>'createdAt')) as c
    from jsonb_array_elements(
      case when jsonb_typeof(p_snap->'notes') = 'array' then p_snap->'notes' else '[]'::jsonb end) n
    where jsonb_typeof(n) = 'object'
    union all
    select jsonb_build_object(
      'id', t->>'id', 'kind', 'tag', 'deleted', false, 'data', t,
      'updatedAt', coalesce(t->>'updatedAt', t->>'createdAt', '2000-01-01T00:00:00Z'))
    from jsonb_array_elements(
      case when jsonb_typeof(p_snap->'tags') = 'array' then p_snap->'tags' else '[]'::jsonb end) t
    where jsonb_typeof(t) = 'object'
  ) s;
$$;

-- 週1のバックアップ(backup-supabase.ps1)が読む app_backups の行を、クラウドの中身で作り直す
create or replace function public.shikou_memo_refresh_backup()
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  snap jsonb;
  cnt integer;
begin
  snap := public.shikou_memo_snapshot();
  cnt := jsonb_array_length(snap->'notes');
  if cnt = 0 then
    return;   -- 空の控えで前回分を潰さない
  end if;
  perform set_config('shikou_memo.internal', 'on', true);
  insert into public.app_backups (app, data, item_count, device, updated_at)
    values ('shikou-memo', snap, cnt, 'server', now())
    on conflict (app) do update
      set data = excluded.data, item_count = excluded.item_count,
          device = excluded.device, updated_at = now();
  perform set_config('shikou_memo.internal', '', true);
end;
$$;

-- 古い版のアプリは「まるごとの控え」を app_backups に直接送ってくる。
-- 件数の少ない端末の控えで上書きされないよう、中身は1件ずつの記録に合流させ(新しい方を残す・何も消さない)、
-- 行そのものはクラウドの中身で組み立て直したものに差し替える。
create or replace function public.app_backups_shikou_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  snap jsonb;
  cnt integer;
begin
  if new.app is distinct from 'shikou-memo' then
    return new;
  end if;
  if coalesce(current_setting('shikou_memo.internal', true), '') = 'on' then
    return new;
  end if;
  perform public.shikou_memo_apply(
    public.shikou_memo_changes_from_snapshot(new.data),
    left('old-app: ' || coalesce(new.device, ''), 120));
  snap := public.shikou_memo_snapshot();
  cnt := jsonb_array_length(snap->'notes');
  if cnt = 0 then
    if tg_op = 'UPDATE' then return old; end if;
    return null;
  end if;
  new.data := snap;
  new.item_count := cnt;
  new.device := 'server';
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_backups_shikou_guard_trg on public.app_backups;
create trigger app_backups_shikou_guard_trg
  before insert or update on public.app_backups
  for each row execute function public.app_backups_shikou_guard();

-- アプリから呼ぶ唯一の入口: 手元の変更を送り、p_since より後にクラウドで変わったものを受け取る
create or replace function public.shikou_memo_sync(
  p_changes jsonb default '[]'::jsonb,
  p_since   bigint default null,
  p_device  text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  n integer;
  v_rev bigint;
  v_since bigint;
  v_records jsonb;
  v_full boolean := false;
begin
  n := public.shikou_memo_apply(p_changes, left(p_device, 120));
  if n > 0 then
    perform public.shikou_memo_refresh_backup();
  end if;
  if p_since is null then
    return jsonb_build_object('applied', n);
  end if;

  -- 先に最大の rev を決めてから、その範囲だけ返す(あとで確定した分を取りこぼさない)
  select coalesce(max(rev), 0) into v_rev from public.shikou_memo_records;
  v_since := p_since;
  if v_since < 0 or v_since > v_rev then
    v_since := 0;   -- クラウド側が作り直された等: 全部を送り直す
  end if;
  v_full := v_since = 0;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'kind', kind, 'deleted', deleted, 'updatedAt', updated_at, 'rev', rev,
           'data', case when deleted then null else data end) order by rev), '[]'::jsonb)
    into v_records
    from public.shikou_memo_records
    where rev > v_since and rev <= v_rev;

  return jsonb_build_object('applied', n, 'rev', v_rev, 'full', v_full, 'records', v_records);
end;
$$;

-- 週1バックアップ用: 合言葉(このPCのファイルにだけある。DBにはハッシュ)で記録と履歴を丸ごと取る
create or replace function public.shikou_memo_backup_dump(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  want text;
begin
  select v into want from public.shikou_memo_secret where k = 'backup_token_sha256';
  if want is null or p_token is null or encode(sha256(convert_to(p_token, 'UTF8')), 'hex') <> want then
    raise exception 'denied';
  end if;
  return jsonb_build_object(
    'at', now(),
    'records', coalesce((select jsonb_agg(to_jsonb(r) order by r.rev) from public.shikou_memo_records r), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(to_jsonb(h) order by h.hid) from public.shikou_memo_history h), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.shikou_memo_apply(jsonb, text) from public, anon, authenticated;
revoke all on function public.shikou_memo_snapshot() from public, anon, authenticated;
revoke all on function public.shikou_memo_changes_from_snapshot(jsonb) from public, anon, authenticated;
revoke all on function public.shikou_memo_refresh_backup() from public, anon, authenticated;
revoke all on function public.app_backups_shikou_guard() from public, anon, authenticated;
revoke all on function public.shikou_memo_sync(jsonb, bigint, text) from public;
revoke all on function public.shikou_memo_backup_dump(text) from public;
grant execute on function public.shikou_memo_sync(jsonb, bigint, text) to anon, authenticated;
grant execute on function public.shikou_memo_backup_dump(text) to anon, authenticated;

-- app_backups は誰も削除しない表なので、公開キーからの削除を閉じる(控えの行を消されないように)
drop policy if exists app_backups_anon_all on public.app_backups;
create policy app_backups_anon_select on public.app_backups for select to anon, authenticated using (true);
create policy app_backups_anon_insert on public.app_backups for insert to anon, authenticated with check (true);
create policy app_backups_anon_update on public.app_backups for update to anon, authenticated using (true) with check (true);
revoke delete, truncate on public.app_backups from anon, authenticated;

-- 作り直すときは、最後に週1バックアップの app_backups.json か shikou_memo_dump.json から中身を戻す。例:
--   select public.shikou_memo_apply(public.shikou_memo_changes_from_snapshot('<app_backups の data>'::jsonb), 'restore');
--   select public.shikou_memo_refresh_backup();
-- 合言葉のハッシュ: insert into public.shikou_memo_secret (k, v) values ('backup_token_sha256', '<sha256>');
