export interface Building {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Floor {
  id: string;
  number: number;
  name: string;
  building_id: string;
  created_at: string;
  building?: Building;
}

export interface Room {
  id: string;
  name: string;
  floor_id: string;
  room_type: 'classroom' | 'lab' | 'auditorium' | 'conference' | 'seminar' | 'discussion';
  capacity: number | null;
  equipment: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  floor?: Floor;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  department: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  room_id: string;
  teacher_id: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  class_division: string | null;
  panel: string | null;
  year_course: string | null;
  is_recurring: boolean;
  created_at: string;
  updated_at: string;
  room?: Room;
  profiles?: {
    full_name: string;
  };
}