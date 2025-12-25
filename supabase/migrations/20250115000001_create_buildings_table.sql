-- Create buildings table (if it doesn't exist)
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

-- Create index
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

