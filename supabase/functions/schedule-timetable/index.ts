import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface Profile {
  id: string
  full_name: string | null
  is_admin: boolean | null
  email: string | null
}

interface RoomTemplate {
  id: string
  room_id: string
  teacher_name: string
  title: string
  weekday: number
  start_time: string
  duration_minutes: number
  notes: string | null
  repeat_interval_weeks: number
  effective_from: string
  is_active: boolean
  created_by: string | null
}

interface RoomInfo {
  id: string
  name: string | null
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MS_PER_MINUTE = 60 * 1000
const DAYS_PER_WEEK = 7

function startOfWeek(date: Date): Date {
  const result = new Date(date)
  const day = result.getUTCDay()
  const diff = (day + 6) % 7
  result.setUTCDate(result.getUTCDate() - diff)
  result.setUTCHours(0, 0, 0, 0)
  return result
}

function addDays(date: Date, amount: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + amount)
  return result
}

function addMinutes(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * MS_PER_MINUTE)
}

function combineDateAndTime(baseDate: Date, timeString: string): Date {
  const result = new Date(baseDate)
  const [hours = '0', minutes = '0', seconds = '0'] = timeString.split(':')
  result.setUTCHours(Number(hours), Number(minutes), Number(seconds), 0)
  return result
}

function dateToISODateString(date: Date): string {
  return date.toISOString().split('T')[0]!
}

function weeksBetween(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime()
  return Math.floor(diffMs / (DAYS_PER_WEEK * 24 * 60 * 60 * 1000))
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase credentials')
    }

    const supabase = createClient(supabaseUrl, serviceKey)

    const emailFunctionUrl = `${supabaseUrl}/functions/v1/send-booking-emails`

    const [
      { data: templates, error: templateError },
      { data: profiles, error: profileError },
      { data: rooms, error: roomError },
    ] = await Promise.all([
      supabase.from('room_timetable_templates').select('*').eq('is_active', true),
      supabase.from('profiles').select('id, full_name, is_admin, email'),
      supabase.from('rooms').select('id, name'),
    ])

    if (templateError) throw templateError
    if (profileError) throw profileError
    if (roomError) throw roomError

    const profileByName = new Map<string, Profile>()
    const roomById = new Map<string, RoomInfo>()
    let fallbackTeacherId: string | null = null

    for (const profile of (profiles as Profile[]) ?? []) {
      if (profile.full_name) {
        profileByName.set(profile.full_name.trim().toLowerCase(), profile)
      }
      if (!fallbackTeacherId && profile.is_admin) {
        fallbackTeacherId = profile.id
      }
    }

    for (const room of (rooms as RoomInfo[]) ?? []) {
      roomById.set(room.id, room)
    }

    const results: Array<{ templateId: string; weekStart: string; status: 'created' | 'skipped'; reason?: string }> = []

    const now = new Date()
    const windowStart = startOfWeek(now)

    for (const template of (templates as RoomTemplate[]) ?? []) {
      if (!template.is_active) continue

      const effectiveFrom = startOfWeek(new Date(template.effective_from))

      for (let weekOffset = 0; weekOffset < 2; weekOffset += 1) {
        const weekStart = addDays(windowStart, weekOffset * DAYS_PER_WEEK)
        const weekStartIso = dateToISODateString(weekStart)

        const weeksDiff = weeksBetween(effectiveFrom, weekStart)
        if (weeksDiff < 0) {
          results.push({ templateId: template.id, weekStart: weekStartIso, status: 'skipped', reason: 'before_effective_date' })
          continue
        }

        if (weeksDiff % template.repeat_interval_weeks !== 0) {
          results.push({ templateId: template.id, weekStart: weekStartIso, status: 'skipped', reason: 'interval_mismatch' })
          continue
        }

        const { data: existingBooking, error: existingError } = await supabase
          .from('bookings')
          .select('id')
          .eq('template_id', template.id)
          .eq('generated_for_week', weekStartIso)
          .maybeSingle()

        if (existingError) throw existingError
        if (existingBooking) {
          results.push({ templateId: template.id, weekStart: weekStartIso, status: 'skipped', reason: 'already_exists' })
          continue
        }

        const { data: exception, error: exceptionError } = await supabase
          .from('room_timetable_template_exceptions')
          .select('id')
          .eq('template_id', template.id)
          .eq('week_start_date', weekStartIso)
          .maybeSingle()

        if (exceptionError) throw exceptionError
        if (exception) {
          results.push({ templateId: template.id, weekStart: weekStartIso, status: 'skipped', reason: 'exception' })
          continue
        }

        const targetDate = addDays(weekStart, template.weekday)
        const startDateTime = combineDateAndTime(targetDate, template.start_time)
        const endDateTime = addMinutes(startDateTime, template.duration_minutes)

        const normalizedName = template.teacher_name.trim().toLowerCase()
        const matchedProfile = profileByName.get(normalizedName)

        const teacherId = matchedProfile?.id ?? template.created_by ?? fallbackTeacherId
        if (!teacherId) {
          results.push({ templateId: template.id, weekStart: weekStartIso, status: 'skipped', reason: 'no_teacher_match' })
          continue
        }

        const { error: insertError } = await supabase.from('bookings').insert({
          room_id: template.room_id,
          teacher_id: teacherId,
          title: template.title,
          description: template.notes,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          is_recurring: true,
          status: 'confirmed',
          template_id: template.id,
          template_teacher_name: template.teacher_name,
          generated_for_week: weekStartIso,
        })

        if (insertError) {
          results.push({ templateId: template.id, weekStart: weekStartIso, status: 'skipped', reason: insertError.message })
        } else {
          results.push({ templateId: template.id, weekStart: weekStartIso, status: 'created' })

          const recipients = new Set<string>()
          if (matchedProfile?.email) {
            recipients.add(matchedProfile.email)
          }

          if (recipients.size > 0) {
            const durationLabel = template.duration_minutes % 60 === 0
              ? `${template.duration_minutes / 60} hour${template.duration_minutes / 60 === 1 ? '' : 's'}`
              : `${template.duration_minutes} minutes`

            try {
              await fetch(emailFunctionUrl, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${serviceKey}`,
                  apikey: serviceKey,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  emails: Array.from(recipients),
                  bookingName: template.title,
                  date: startDateTime.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }),
                  time: startDateTime.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  }),
                  room: roomById.get(template.room_id)?.name || 'Room',
                  duration: durationLabel,
                  additionalInfo: template.notes || '',
                }),
              })
            } catch (emailError) {
              console.warn('Failed to send timetable email', emailError)
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        generatedCount: results.filter((r) => r.status === 'created').length,
        skippedCount: results.filter((r) => r.status === 'skipped').length,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('[schedule-timetable] error', error)
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
}





