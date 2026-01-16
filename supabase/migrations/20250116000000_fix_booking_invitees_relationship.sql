-- Create booking_invitees table if it doesn't exist and fix relationships for PostgREST
-- This ensures PostgREST can properly detect the foreign key relationship

-- Create the table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.booking_invitees (
  booking_id uuid NOT NULL,
  invitee_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, invitee_id)
);

-- Enable RLS
ALTER TABLE public.booking_invitees ENABLE ROW LEVEL SECURITY;

-- Drop existing foreign keys if they exist (to recreate with explicit names)
DO $$ 
BEGIN
    -- Drop booking_id foreign key if it exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name LIKE '%booking_id%' 
        AND table_name = 'booking_invitees'
        AND constraint_type = 'FOREIGN KEY'
    ) THEN
        ALTER TABLE public.booking_invitees 
        DROP CONSTRAINT IF EXISTS booking_invitees_booking_id_fkey;
    END IF;
    
    -- Drop invitee_id foreign key if it exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name LIKE '%invitee_id%' 
        AND table_name = 'booking_invitees'
        AND constraint_type = 'FOREIGN KEY'
    ) THEN
        ALTER TABLE public.booking_invitees 
        DROP CONSTRAINT IF EXISTS booking_invitees_invitee_id_fkey;
    END IF;
END $$;

-- Add foreign keys with explicit names that PostgREST can recognize
DO $$
BEGIN
    -- Add booking_id foreign key if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'booking_invitees_booking_id_fkey'
        AND table_name = 'booking_invitees'
    ) THEN
        ALTER TABLE public.booking_invitees
        ADD CONSTRAINT booking_invitees_booking_id_fkey 
        FOREIGN KEY (booking_id) 
        REFERENCES public.bookings(id) 
        ON DELETE CASCADE;
    END IF;
    
    -- Add invitee_id foreign key if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'booking_invitees_invitee_id_fkey'
        AND table_name = 'booking_invitees'
    ) THEN
        ALTER TABLE public.booking_invitees
        ADD CONSTRAINT booking_invitees_invitee_id_fkey 
        FOREIGN KEY (invitee_id) 
        REFERENCES public.profiles(id) 
        ON DELETE CASCADE;
    END IF;
END $$;

-- Create RLS policies if they don't exist
DO $$
BEGIN
    -- Owner can manage invitees
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'booking_invitees' 
        AND policyname = 'owner_can_manage_invitees'
    ) THEN
        CREATE POLICY "owner_can_manage_invitees"
        ON public.booking_invitees
        AS PERMISSIVE
        FOR ALL
        TO authenticated
        USING (
            EXISTS (
                SELECT 1 FROM public.bookings b
                WHERE b.id = booking_id AND b.teacher_id = auth.uid()
            )
        )
        WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.bookings b
                WHERE b.id = booking_id AND b.teacher_id = auth.uid()
            )
        );
    END IF;
    
    -- Invitees can read their invitations
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'booking_invitees' 
        AND policyname = 'invitee_can_read'
    ) THEN
        CREATE POLICY "invitee_can_read"
        ON public.booking_invitees
        AS PERMISSIVE
        FOR SELECT
        TO authenticated
        USING (invitee_id = auth.uid());
    END IF;
END $$;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS booking_invitees_invitee_id_idx 
ON public.booking_invitees(invitee_id);
