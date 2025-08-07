-- Add constraint to prevent overlapping bookings for the same user
-- This ensures one person can only have one booking at a time
CREATE OR REPLACE FUNCTION check_user_booking_overlap()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the new booking overlaps with any existing bookings for the same user
    IF EXISTS (
        SELECT 1 FROM public.bookings 
        WHERE teacher_id = NEW.teacher_id 
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
        AND (
            (start_time < NEW.end_time AND end_time > NEW.start_time)
        )
    ) THEN
        RAISE EXCEPTION 'User already has a booking that overlaps with this time period';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce user booking overlap constraint
CREATE TRIGGER check_user_booking_overlap_trigger
    BEFORE INSERT OR UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION check_user_booking_overlap();

-- Add constraint to prevent bookings in the past
CREATE OR REPLACE FUNCTION check_booking_time()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent bookings in the past
    IF NEW.start_time <= NOW() THEN
        RAISE EXCEPTION 'Cannot create bookings in the past';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce booking time constraint
CREATE TRIGGER check_booking_time_trigger
    BEFORE INSERT OR UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION check_booking_time();

-- Add constraint to ensure booking times are within allowed hours (7:30 AM to 10:30 PM)
CREATE OR REPLACE FUNCTION check_booking_hours()
RETURNS TRIGGER AS $$
DECLARE
    start_hour INTEGER;
    end_hour INTEGER;
BEGIN
    -- Extract hours from the booking times
    start_hour := EXTRACT(HOUR FROM NEW.start_time);
    end_hour := EXTRACT(HOUR FROM NEW.end_time);
    
    -- Check if booking is within allowed hours (7:30 AM to 22:30 PM)
    -- Convert to 24-hour format: 7:30 = 7.5, 22:30 = 22.5
    IF start_hour < 7 OR (start_hour = 7 AND EXTRACT(MINUTE FROM NEW.start_time) < 30) THEN
        RAISE EXCEPTION 'Bookings cannot start before 7:30 AM';
    END IF;
    
    IF end_hour > 22 OR (end_hour = 22 AND EXTRACT(MINUTE FROM NEW.end_time) > 30) THEN
        RAISE EXCEPTION 'Bookings cannot end after 10:30 PM';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce booking hours constraint
CREATE TRIGGER check_booking_hours_trigger
    BEFORE INSERT OR UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION check_booking_hours();

-- Add constraint to prevent bookings on weekends
CREATE OR REPLACE FUNCTION check_weekend_bookings()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the booking is on a weekend (Saturday = 6, Sunday = 0)
    IF EXTRACT(DOW FROM NEW.start_time) IN (0, 6) THEN
        RAISE EXCEPTION 'Bookings are not allowed on weekends';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce weekend booking constraint
CREATE TRIGGER check_weekend_bookings_trigger
    BEFORE INSERT OR UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION check_weekend_bookings();

-- Add admin policy for managing all bookings
CREATE POLICY "Admins can manage all bookings" ON public.bookings 
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );

-- Add admin policy for managing all profiles
CREATE POLICY "Admins can manage all profiles" ON public.profiles 
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
    );
