-- Rooms: requires_approval flag
alter table public.rooms
  add column if not exists requires_approval boolean not null default false;

-- Bookings: status and approval metadata
do $$ begin
  create type public.booking_status as enum ('confirmed', 'pending', 'denied', 'cancelled');
exception when duplicate_object then null; end $$;

alter table public.bookings
  add column if not exists status public.booking_status not null default 'confirmed',
  add column if not exists approved_by uuid references public.profiles(id),
  add column if not exists approved_at timestamp with time zone;

-- Ensure future constraints can reference status; existing RLS assumed

-- Index for admin review
create index if not exists bookings_status_idx on public.bookings(status);

