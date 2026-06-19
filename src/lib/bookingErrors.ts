import { ApiError } from "@/lib/apiClient";

// The backend's booking triggers raise friendly Postgres exceptions, but routes/booking.js
// only special-cases the exclusion-constraint violation into a clean 4xx — everything else
// (including these trigger messages, which fire first in practice) falls through to a
// generic 500 with the raw Postgres message in `details`. Match on that text to reproduce
// the old Supabase-error-message-based toasts.
export function getBookingErrorMessage(err: unknown): { title: string; description: string } {
  if (!(err instanceof ApiError)) {
    return { title: "Error", description: "Failed to save booking" };
  }

  const text = `${err.message} ${err.details ?? ""}`;

  if (/already booked|overlapping|exclusion/i.test(text)) {
    return {
      title: "Room Already Booked",
      description: "This time slot conflicts with an existing booking for this room. Please choose a different time or duration.",
    };
  }
  if (/user booking conflict/i.test(text)) {
    return {
      title: "Personal Schedule Conflict",
      description: "You already have a booking that overlaps with this time period. Please choose a different time or duration.",
    };
  }
  if (/past/i.test(text)) {
    return { title: "Invalid Booking Time", description: "Cannot create bookings in the past." };
  }
  if (/weekend/i.test(text)) {
    return { title: "Invalid Booking Time", description: "Bookings are not allowed on weekends." };
  }
  if (/before 7:30/i.test(text)) {
    return { title: "Invalid Start Time", description: "Bookings cannot start before 7:30 AM." };
  }
  if (/after 10:30/i.test(text)) {
    return { title: "Invalid End Time", description: "Bookings cannot end after 10:30 PM." };
  }

  return { title: "Error", description: err.message || "Failed to save booking" };
}
