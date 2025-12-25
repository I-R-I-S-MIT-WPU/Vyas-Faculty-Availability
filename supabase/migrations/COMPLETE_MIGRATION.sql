-- ============================================
-- COMPLETE MIGRATION FOR TIMETABLE SYSTEM
-- Run this entire file in Supabase Dashboard → SQL Editor
-- ============================================

-- Step 1: Create buildings table (if not exists)
CREATE TABLE IF NOT EXISTS public.buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    address TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for buildings
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can view buildings') THEN
        CREATE POLICY "Anyone can view buildings" ON public.buildings FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Only admins can modify buildings') THEN
        CREATE POLICY "Only admins can modify buildings" ON public.buildings FOR ALL USING (
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE profiles.id = auth.uid() 
                AND profiles.is_admin = true
            )
        );
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_buildings_name ON public.buildings(name);
CREATE INDEX IF NOT EXISTS idx_buildings_is_active ON public.buildings(is_active);

-- Add trigger for updated_at
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_buildings_updated_at') THEN
        CREATE TRIGGER update_buildings_updated_at 
        BEFORE UPDATE ON public.buildings 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================
-- Step 2: Create Effective Timetable Functions
-- ============================================

-- Function to generate effective timetable for a room and week
CREATE OR REPLACE FUNCTION public.get_effective_timetable(
    p_room_id UUID,
    p_week_start DATE
)
RETURNS TABLE (
    slot_id UUID,
    slot_type TEXT,
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    title TEXT,
    teacher_name TEXT,
    description TEXT,
    class_division TEXT,
    panel TEXT,
    year_course TEXT,
    template_id UUID,
    booking_id UUID,
    is_cancelled BOOLEAN
) AS $$
DECLARE
    week_end DATE;
BEGIN
    week_end := p_week_start + INTERVAL '6 days';
    
    RETURN QUERY
    WITH week_dates AS (
        SELECT generate_series(
            p_week_start::timestamp,
            (week_end + INTERVAL '1 day')::timestamp,
            INTERVAL '1 day'
        )::date AS day
    ),
    template_slots AS (
        SELECT 
            t.id AS slot_id,
            'template'::TEXT AS slot_type,
            -- Create timestamp in local timezone (assume IST/Asia/Kolkata for Indian time)
            -- This ensures 08:30 in the database is interpreted as 08:30 local time
            ((wd.day::text || ' ' || t.start_time::text)::timestamp AT TIME ZONE 'Asia/Kolkata')::timestamptz AS start_time,
            (((wd.day::text || ' ' || t.start_time::text)::timestamp + (t.duration_minutes || ' minutes')::interval) AT TIME ZONE 'Asia/Kolkata')::timestamptz AS end_time,
            t.title,
            t.teacher_name,
            t.notes AS description,
            NULL::TEXT AS class_division,
            NULL::TEXT AS panel,
            NULL::TEXT AS year_course,
            t.id AS template_id,
            NULL::UUID AS booking_id,
            FALSE AS is_cancelled
        FROM public.room_timetable_templates t
        CROSS JOIN week_dates wd
        WHERE t.room_id = p_room_id
            AND t.is_active = true
            AND t.effective_from <= wd.day
            AND (EXTRACT(ISODOW FROM wd.day) - 1) = t.weekday
            AND (
                t.repeat_interval_weeks = 1 
                OR MOD((wd.day - t.effective_from)::INTEGER / 7, t.repeat_interval_weeks) = 0
            )
    ),
    exceptions AS (
        SELECT 
            e.template_id,
            e.week_start_date
        FROM public.room_timetable_template_exceptions e
        WHERE e.week_start_date = p_week_start
    ),
    active_template_slots AS (
        SELECT ts.*
        FROM template_slots ts
        WHERE NOT EXISTS (
            SELECT 1 FROM exceptions e 
            WHERE e.template_id = ts.template_id
        )
    ),
    booking_slots AS (
        SELECT 
            b.id AS slot_id,
            'booking'::TEXT AS slot_type,
            b.start_time,
            b.end_time,
            b.title,
            COALESCE(
                b.template_teacher_name,
                p.full_name
            ) AS teacher_name,
            b.description,
            b.class_division,
            b.panel,
            b.year_course,
            NULL::UUID AS template_id,
            b.id AS booking_id,
            FALSE AS is_cancelled
        FROM public.bookings b
        LEFT JOIN public.profiles p ON p.id = b.teacher_id
        WHERE b.room_id = p_room_id
            AND b.status = 'confirmed'
            AND b.start_time >= p_week_start::timestamp with time zone
            AND b.start_time < (week_end + INTERVAL '1 day')::timestamp with time zone
    ),
    cancelled_slots AS (
        SELECT 
            ts.slot_id,
            'exception_cancelled'::TEXT AS slot_type,
            ts.start_time,
            ts.end_time,
            ts.title,
            ts.teacher_name,
            ts.description,
            ts.class_division,
            ts.panel,
            ts.year_course,
            ts.template_id,
            NULL::UUID AS booking_id,
            TRUE AS is_cancelled
        FROM template_slots ts
        INNER JOIN exceptions e ON e.template_id = ts.template_id
    )
    SELECT * FROM active_template_slots
    UNION ALL
    SELECT * FROM booking_slots
    UNION ALL
    SELECT * FROM cancelled_slots
    ORDER BY start_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check slot availability
CREATE OR REPLACE FUNCTION public.check_slot_availability(
    p_room_id UUID,
    p_start_time TIMESTAMP WITH TIME ZONE,
    p_end_time TIMESTAMP WITH TIME ZONE,
    p_exclude_booking_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    week_start DATE;
    slot_overlaps BOOLEAN;
BEGIN
    week_start := DATE_TRUNC('week', p_start_time::date)::date;
    IF EXTRACT(DOW FROM week_start) != 1 THEN
        week_start := week_start - INTERVAL '1 day' * (EXTRACT(DOW FROM week_start)::integer - 1);
    END IF;
    
    SELECT EXISTS(
        SELECT 1
        FROM public.get_effective_timetable(p_room_id, week_start) et
        WHERE et.slot_type != 'exception_cancelled'
            AND et.is_cancelled = false
            AND et.start_time < p_end_time
            AND et.end_time > p_start_time
            AND (p_exclude_booking_id IS NULL OR et.booking_id != p_exclude_booking_id)
    ) INTO slot_overlaps;
    
    RETURN NOT slot_overlaps;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create template exception
CREATE OR REPLACE FUNCTION public.create_template_exception(
    p_template_id UUID,
    p_week_start_date DATE,
    p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_teacher_name TEXT;
    v_user_name TEXT;
    v_exception_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User must be authenticated';
    END IF;
    
    SELECT teacher_name INTO v_teacher_name
    FROM public.room_timetable_templates
    WHERE id = p_template_id;
    
    IF v_teacher_name IS NULL THEN
        RAISE EXCEPTION 'Template not found';
    END IF;
    
    SELECT full_name INTO v_user_name
    FROM public.profiles
    WHERE id = v_user_id;
    
    IF NOT (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = v_user_id AND is_admin = true
        )
        OR LOWER(COALESCE(v_user_name, '')) = LOWER(v_teacher_name)
    ) THEN
        RAISE EXCEPTION 'Permission denied: Only admins or the template teacher can create exceptions';
    END IF;
    
    INSERT INTO public.room_timetable_template_exceptions (
        template_id,
        week_start_date,
        reason,
        created_by
    ) VALUES (
        p_template_id,
        p_week_start_date,
        p_reason,
        v_user_id
    )
    ON CONFLICT (template_id, week_start_date) DO UPDATE
    SET reason = COALESCE(EXCLUDED.reason, room_timetable_template_exceptions.reason),
        updated_at = NOW()
    RETURNING id INTO v_exception_id;
    
    RETURN v_exception_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_effective_timetable(UUID, DATE) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.check_slot_availability(UUID, TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.create_template_exception(UUID, DATE, TEXT) TO authenticated;

