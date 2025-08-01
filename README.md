# Vyaas Room Flow

A modern room booking and scheduling system for educational institutions, built with React and Supabase.

## What it does

Vyaas Room Flow is a web application that helps manage room bookings across multiple floors of a building. It provides:

- **Room Calendar View**: Visual calendar interface showing room availability and bookings
- **Room Selection**: Filter and select rooms by floor, type, and capacity
- **Booking Management**: Create, view, and cancel room bookings
- **User Dashboard**: Personal dashboard to manage your bookings
- **Authentication**: Secure user login and profile management

The system is designed for educational institutions where teachers and staff need to book classrooms, labs, auditoriums, and other spaces for classes, meetings, and events.

## Tech Stack

### Frontend

- **React 18** with TypeScript for type safety
- **Vite** for fast development and building
- **React Router** for navigation
- **Tailwind CSS** for styling
- **shadcn/ui** for beautiful, accessible components
- **React Query** for data fetching and caching
- **React Hook Form** with Zod for form validation

### Backend & Database

- **Supabase** for backend-as-a-service
  - PostgreSQL database
  - Real-time subscriptions
  - Row Level Security (RLS)
  - Built-in authentication

### Key Features

- Dark/light theme support
- Responsive design for mobile and desktop
- Real-time updates
- Form validation and error handling
- Toast notifications

## Quick Start

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd vyas-room-flow
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file with your Supabase credentials:

   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start development server**

   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:5173`

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── calendar/       # Calendar and booking components
│   ├── filters/        # Room filtering components
│   ├── layout/         # Layout components (Header, etc.)
│   ├── selectors/      # Room selection components
│   ├── theme/          # Theme management
│   └── ui/             # shadcn/ui components
├── hooks/              # Custom React hooks
├── integrations/       # External service integrations
│   └── supabase/       # Supabase client and types
├── lib/                # Utility functions
├── pages/              # Main application pages
└── types/              # TypeScript type definitions
```

## Database Schema

The application uses a simple but effective database structure:

- **Floors**: Building floors with names and numbers
- **Rooms**: Individual rooms with types, capacity, and equipment
- **Profiles**: User profiles with department and admin status
- **Bookings**: Room reservations with time slots and metadata

## Development

- **Build**: `npm run build`
- **Preview**: `npm run preview`
- **Lint**: `npm run lint`

## Deployment

The application can be deployed to any static hosting service like Vercel, Netlify, or GitHub Pages. Make sure to set up your environment variables in your hosting platform.
