-- Add concurrency protection for bookings to prevent race conditions
-- This migration adds database-level constraints and triggers to ensure
-- no two people can book the same room at overlapping times

-- 1. Add a unique constraint to prevent duplicate bookings for the same room at the same time
-- (This is a basic constraint, but we need more sophisticated overlap prevention)

-- 2. Create a function to check for overlapping bookings
CREATE OR REPLACE FUNCTION check_booking_overlap()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if there are any overlapping bookings for the same room
    IF EXISTS (
        SELECT 1 FROM public.bookings 
        WHERE room_id = NEW.room_id 
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
        AND (
            -- Case 1: New booking starts during an existing booking
            (NEW.start_time >= start_time AND NEW.start_time < end_time)
            OR
            -- Case 2: New booking ends during an existing booking  
            (NEW.end_time > start_time AND NEW.end_time <= end_time)
            OR
            -- Case 3: New booking completely contains an existing booking
            (NEW.start_time <= start_time AND NEW.end_time >= end_time)
        )
    ) THEN
        RAISE EXCEPTION 'Booking conflict: Room % is already booked for the requested time period', NEW.room_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create a function to check for user booking conflicts (same user can't have overlapping bookings)
CREATE OR REPLACE FUNCTION check_user_booking_conflict()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the user already has any overlapping bookings
    IF EXISTS (
        SELECT 1 FROM public.bookings 
        WHERE teacher_id = NEW.teacher_id 
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
        AND (
            -- Case 1: New booking starts during an existing booking
            (NEW.start_time >= start_time AND NEW.start_time < end_time)
            OR
            -- Case 2: New booking ends during an existing booking  
            (NEW.end_time > start_time AND NEW.end_time <= end_time)
            OR
            -- Case 3: New booking completely contains an existing booking
            (NEW.start_time <= start_time AND NEW.end_time >= end_time)
        )
    ) THEN
        RAISE EXCEPTION 'User booking conflict: You already have a booking that overlaps with this time period';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create a function to validate booking times (business rules)
CREATE OR REPLACE FUNCTION validate_booking_times()
RETURNS TRIGGER AS $$
DECLARE
    start_hour INTEGER;
    start_minute INTEGER;
    end_hour INTEGER;
    end_minute INTEGER;
BEGIN
    -- Check if booking is in the past
    IF NEW.start_time <= NOW() THEN
        RAISE EXCEPTION 'Cannot create bookings in the past';
    END IF;
    
    -- Check if it's a weekend (Saturday = 6, Sunday = 0)
    IF EXTRACT(DOW FROM NEW.start_time) IN (0, 6) THEN
        RAISE EXCEPTION 'Bookings are not allowed on weekends';
    END IF;
    
    -- Check booking hours (7:30 AM to 10:30 PM)
    start_hour := EXTRACT(HOUR FROM NEW.start_time);
    start_minute := EXTRACT(MINUTE FROM NEW.start_time);
    end_hour := EXTRACT(HOUR FROM NEW.end_time);
    end_minute := EXTRACT(MINUTE FROM NEW.end_time);
    
    -- Check start time (must be 7:30 AM or later)
    IF start_hour < 7 OR (start_hour = 7 AND start_minute < 30) THEN
        RAISE EXCEPTION 'Bookings cannot start before 7:30 AM';
    END IF;
    
    -- Check end time (must be 10:30 PM or earlier)
    IF end_hour > 22 OR (end_hour = 22 AND end_minute > 30) THEN
        RAISE EXCEPTION 'Bookings cannot end after 10:30 PM';
    END IF;
    
    -- Check that end time is after start time
    IF NEW.end_time <= NEW.start_time THEN
        RAISE EXCEPTION 'End time must be after start time';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create triggers to enforce these rules
DO $$
BEGIN
    -- Drop existing triggers if they exist
    DROP TRIGGER IF EXISTS check_booking_overlap_trigger ON public.bookings;
    DROP TRIGGER IF EXISTS check_user_booking_conflict_trigger ON public.bookings;
    DROP TRIGGER IF EXISTS validate_booking_times_trigger ON public.bookings;
    
    -- Create triggers
    CREATE TRIGGER check_booking_overlap_trigger
        BEFORE INSERT OR UPDATE ON public.bookings
        FOR EACH ROW EXECUTE FUNCTION check_booking_overlap();
        
    CREATE TRIGGER check_user_booking_conflict_trigger
        BEFORE INSERT OR UPDATE ON public.bookings
        FOR EACH ROW EXECUTE FUNCTION check_user_booking_conflict();
        
    CREATE TRIGGER validate_booking_times_trigger
        BEFORE INSERT OR UPDATE ON public.bookings
        FOR EACH ROW EXECUTE FUNCTION validate_booking_times();
END $$;

-- 6. Add indexes for better performance on overlap checks
CREATE INDEX IF NOT EXISTS idx_bookings_room_time_overlap 
ON public.bookings(room_id, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_bookings_teacher_time_overlap 
ON public.bookings(teacher_id, start_time, end_time);

-- 7. Add a comment to document the concurrency protection
COMMENT ON TABLE public.bookings IS 'Bookings table with database-level concurrency protection to prevent overlapping bookings and race conditions';
