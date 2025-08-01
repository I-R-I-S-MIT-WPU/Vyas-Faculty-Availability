-- Create enum for room types
CREATE TYPE public.room_type AS ENUM ('classroom', 'lab', 'auditorium', 'conference', 'seminar');

-- Create floors table
CREATE TABLE public.floors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create rooms table
CREATE TABLE public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    floor_id UUID REFERENCES public.floors(id) ON DELETE CASCADE,
    room_type public.room_type NOT NULL DEFAULT 'classroom',
    capacity INTEGER,
    equipment TEXT[],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create profiles table for teachers
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    department TEXT,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create bookings table
CREATE TABLE public.bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE NOT NULL,
    teacher_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    class_division TEXT,
    panel TEXT,
    year_course TEXT,
    is_recurring BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index to prevent overlapping bookings
CREATE UNIQUE INDEX idx_no_overlap_bookings ON public.bookings 
USING btree (room_id, start_time, end_time);

-- Add check constraint for valid time range
ALTER TABLE public.bookings ADD CONSTRAINT valid_time_range 
CHECK (start_time < end_time);

-- Enable RLS on all tables
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for floors (public read)
CREATE POLICY "Anyone can view floors" ON public.floors FOR SELECT USING (true);
CREATE POLICY "Only admins can modify floors" ON public.floors FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

-- RLS Policies for rooms (public read)
CREATE POLICY "Anyone can view rooms" ON public.rooms FOR SELECT USING (true);
CREATE POLICY "Only admins can modify rooms" ON public.rooms FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS Policies for bookings
CREATE POLICY "Anyone can view bookings" ON public.bookings FOR SELECT USING (true);
CREATE POLICY "Teachers can create bookings" ON public.bookings FOR INSERT 
    WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "Teachers can update own bookings" ON public.bookings FOR UPDATE 
    USING (auth.uid() = teacher_id);
CREATE POLICY "Teachers can delete own bookings" ON public.bookings FOR DELETE 
    USING (auth.uid() = teacher_id);

-- Create trigger function for updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updating updated_at columns
CREATE TRIGGER update_rooms_updated_at
    BEFORE UPDATE ON public.rooms
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at
    BEFORE UPDATE ON public.bookings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
        NEW.email
    );
    RETURN NEW;
END;
$$;

-- Trigger for auto-creating profile on user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insert sample data
INSERT INTO public.floors (number, name) VALUES
(1, 'Ground Floor'),
(2, 'First Floor'),
(3, 'Second Floor'),
(4, 'Third Floor');

-- Insert sample rooms
INSERT INTO public.rooms (name, floor_id, room_type, capacity) 
SELECT 
    CASE 
        WHEN f.number = 1 THEN 'Room G' || (series + 100)
        WHEN f.number = 2 THEN 'Room 1' || (series + 100) 
        WHEN f.number = 3 THEN 'Room 2' || (series + 100)
        WHEN f.number = 4 THEN 'Room 3' || (series + 100)
    END,
    f.id,
    CASE WHEN series % 3 = 0 THEN 'lab'::room_type ELSE 'classroom'::room_type END,
    CASE WHEN series % 3 = 0 THEN 30 ELSE 60 END
FROM public.floors f
CROSS JOIN generate_series(1, 8) as series;