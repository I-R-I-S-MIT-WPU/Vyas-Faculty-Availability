-- Add recurring room timetable templates and exceptions

-- Table storing long-lived timetable templates per room
CREATE TABLE IF NOT EXISTS public.room_timetable_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    teacher_name TEXT NOT NULL,
    title TEXT NOT NULL,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time TIME WITHOUT TIME ZONE NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    notes TEXT,
    repeat_interval_weeks INTEGER NOT NULL DEFAULT 2 CHECK (repeat_interval_weeks > 0),
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table capturing per-week overrides/edits for templates
CREATE TABLE IF NOT EXISTS public.room_timetable_template_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES public.room_timetable_templates(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    resolved_booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
    reason TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(template_id, week_start_date)
);

-- Additional metadata on bookings to track template origin
ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.room_timetable_templates(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS template_teacher_name TEXT,
    ADD COLUMN IF NOT EXISTS generated_for_week DATE;

-- Enable RLS on new tables
ALTER TABLE public.room_timetable_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_timetable_template_exceptions ENABLE ROW LEVEL SECURITY;

-- Policies: anyone with access can view templates/exceptions; only admins can modify
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can view timetable templates'
    ) THEN
        CREATE POLICY "Anyone can view timetable templates" ON public.room_timetable_templates FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Admins manage timetable templates'
    ) THEN
        CREATE POLICY "Admins manage timetable templates" ON public.room_timetable_templates
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.is_admin = true
            )
        ) WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.is_admin = true
            )
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can view timetable template exceptions'
    ) THEN
        CREATE POLICY "Anyone can view timetable template exceptions" ON public.room_timetable_template_exceptions FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Admins manage timetable template exceptions'
    ) THEN
        CREATE POLICY "Admins manage timetable template exceptions" ON public.room_timetable_template_exceptions
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.is_admin = true
            )
        ) WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND p.is_admin = true
            )
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Template teachers can insert timetable exceptions'
    ) THEN
        CREATE POLICY "Template teachers can insert timetable exceptions" ON public.room_timetable_template_exceptions
        FOR INSERT WITH CHECK (
            EXISTS (
                SELECT 1
                FROM public.profiles p
                JOIN public.room_timetable_templates t
                    ON lower(t.teacher_name) = lower(p.full_name)
                WHERE p.id = auth.uid()
                AND t.id = room_timetable_template_exceptions.template_id
            )
        );
    END IF;
END $$;

-- Allow teachers whose name matches the template to manage generated bookings
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Template teachers can update bookings'
    ) THEN
        CREATE POLICY "Template teachers can update bookings" ON public.bookings
        FOR UPDATE USING (
            template_teacher_name IS NOT NULL AND
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND lower(p.full_name) = lower(public.bookings.template_teacher_name)
            )
        )
        WITH CHECK (
            template_teacher_name IS NOT NULL AND
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND lower(p.full_name) = lower(public.bookings.template_teacher_name)
            )
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Template teachers can delete bookings'
    ) THEN
        CREATE POLICY "Template teachers can delete bookings" ON public.bookings
        FOR DELETE USING (
            template_teacher_name IS NOT NULL AND
            EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
                AND lower(p.full_name) = lower(public.bookings.template_teacher_name)
            )
        );
    END IF;
END $$;

-- Indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_room_timetable_templates_room_weekday
    ON public.room_timetable_templates (room_id, weekday)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_room_timetable_templates_teacher_name
    ON public.room_timetable_templates (lower(teacher_name));

CREATE INDEX IF NOT EXISTS idx_room_timetable_template_exceptions_template_week
    ON public.room_timetable_template_exceptions (template_id, week_start_date);

CREATE INDEX IF NOT EXISTS idx_bookings_template_week
    ON public.bookings (template_id, generated_for_week)
    WHERE template_id IS NOT NULL;

-- Ensure updated_at columns stay fresh
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_room_timetable_templates_updated_at') THEN
        CREATE TRIGGER update_room_timetable_templates_updated_at
        BEFORE UPDATE ON public.room_timetable_templates
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_room_timetable_template_exceptions_updated_at') THEN
        CREATE TRIGGER update_room_timetable_template_exceptions_updated_at
        BEFORE UPDATE ON public.room_timetable_template_exceptions
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;





