-- Create table for booking invitees
create table if not exists public.booking_invitees (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (booking_id, invitee_id)
);

alter table public.booking_invitees enable row level security;

-- Allow booking owner (teacher_id) to manage invitees for their bookings
create policy if not exists "owner_can_manage_invitees"
on public.booking_invitees
as permissive
for all
to authenticated
using (
  exists (
    select 1 from public.bookings b
    where b.id = booking_id and b.teacher_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.bookings b
    where b.id = booking_id and b.teacher_id = auth.uid()
  )
);

-- Allow invitees to read their invitations
create policy if not exists "invitee_can_read"
on public.booking_invitees
as permissive
for select
to authenticated
using (invitee_id = auth.uid());

-- Helpful index for queries by invitee
create index if not exists booking_invitees_invitee_id_idx on public.booking_invitees(invitee_id);

