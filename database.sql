
create table if not exists profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique,
 avatar_url text,
 is_online boolean default false,
 last_seen timestamp,
 created_at timestamp default now()
);

create table if not exists messages(
 id bigint generated always as identity primary key,
 sender_id uuid not null references auth.users(id) on delete cascade,
 receiver_id uuid not null references auth.users(id) on delete cascade,
 message text not null,
 is_read boolean default false,
 created_at timestamp default now()
);

do $$
begin
    alter publication supabase_realtime add table messages;
exception
    when duplicate_object then null;
end $$;

alter table profiles enable row level security;
alter table messages enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on profiles to authenticated;
grant select, insert, update on messages to authenticated;
grant usage on all sequences in schema public to authenticated;

drop policy if exists "Profiles are visible to signed-in users" on profiles;
drop policy if exists "Users can create their own profile" on profiles;
drop policy if exists "Users can update their own profile" on profiles;
drop policy if exists "Users can read their conversations" on messages;
drop policy if exists "Users can send their own messages" on messages;
drop policy if exists "Users can update messages sent to them" on messages;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create policy "Profiles are visible to signed-in users"
on profiles for select
to authenticated
using (true);

create policy "Users can create their own profile"
on profiles for insert
to authenticated
with check (auth.uid() = id);

create policy "Users can update their own profile"
on profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users can read their conversations"
on messages for select
to authenticated
using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can send their own messages"
on messages for insert
to authenticated
with check (auth.uid() = sender_id);

create policy "Users can update messages sent to them"
on messages for update
to authenticated
using (auth.uid() = receiver_id)
with check (auth.uid() = receiver_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles(id, username)
    values (
        new.id,
        split_part(new.email, '@', 1) || '-' || left(new.id::text, 8)
    )
    on conflict (id) do nothing;

    return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
