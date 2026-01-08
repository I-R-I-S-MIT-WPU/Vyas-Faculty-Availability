-- Fix timezone issue in get_effective_timetable function
-- This fixes the bug where templates show at wrong times (e.g., 8:30 showing at 1:30)

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
                OR MOD(
                    -- Calculate week number difference: normalize both dates to Monday, then calculate weeks
                    -- DATE_TRUNC('week', date) returns the Monday of that week
                    ((DATE_TRUNC('week', wd.day)::date - DATE_TRUNC('week', t.effective_from)::date) / 7),
                    t.repeat_interval_weeks
                ) = 0
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

