import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export default async function handler(req: Request) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const { bookingId, inviteeIds = [], extraEmails = [] } = await req.json()

    if (!bookingId) {
      return new Response(
        JSON.stringify({ error: 'Booking ID is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Fetch booking details with related data
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select(`
        *,
        room:rooms(name, building, floor),
        teacher:profiles(full_name, email)
      `)
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return new Response(
        JSON.stringify({ error: 'Booking not found' }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Fetch invitee details
    let inviteeEmails = []
    if (inviteeIds.length > 0) {
      const { data: invitees, error: inviteeError } = await supabase
        .from('profiles')
        .select('email, full_name')
        .in('id', inviteeIds)

      if (!inviteeError && invitees) {
        inviteeEmails = invitees.map(invitee => ({
          email: invitee.email,
          name: invitee.full_name
        }))
      }
    }

    // Combine all email addresses
    const allEmails = [
      ...inviteeEmails.map(i => i.email),
      ...extraEmails
    ].filter(Boolean)

    if (allEmails.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No emails to send' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Format dates
    const startTime = new Date(booking.start_time)
    const endTime = new Date(booking.end_time)
    const date = startTime.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
    const time = startTime.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    })
    const duration = Math.round((endTime - startTime) / (1000 * 60 * 60)) // hours

    // Prepare email data
    const emailData = {
      emails: allEmails,
      bookingName: booking.title,
      date: date,
      time: time,
      room: booking.room?.name || 'Unknown Room',
      duration: `${duration} hour${duration !== 1 ? 's' : ''}`,
      additionalInfo: booking.description || '',
      teacherName: booking.teacher?.full_name || 'Unknown',
      teacherEmail: booking.teacher?.email || '',
      building: booking.room?.building || '',
      floor: booking.room?.floor || ''
    }

    // Send emails using Resend API
    try {
      const resendApiKey = Deno.env.get('RESEND_API_KEY')
      
      if (!resendApiKey) {
        console.warn('RESEND_API_KEY not found, skipping email sending')
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: 'Email service not configured, booking created successfully',
            emailData 
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      // Send email to all recipients
      const emailPromises = allEmails.map(async (email) => {
        const emailPayload = {
          from: 'Room Booking System <noreply@yourdomain.com>',
          to: [email],
          subject: `Room Booking Confirmation: ${emailData.bookingName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #2563eb;">Room Booking Confirmation</h2>
              
              <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #1e293b;">${emailData.bookingName}</h3>
                
                <div style="margin: 15px 0;">
                  <strong>📅 Date:</strong> ${emailData.date}<br>
                  <strong>🕐 Time:</strong> ${emailData.time}<br>
                  <strong>⏱️ Duration:</strong> ${emailData.duration}<br>
                  <strong>🏢 Room:</strong> ${emailData.room}<br>
                  <strong>👤 Booked by:</strong> ${emailData.teacherName}
                </div>
                
                ${emailData.additionalInfo ? `
                  <div style="margin: 15px 0;">
                    <strong>📝 Additional Information:</strong><br>
                    ${emailData.additionalInfo}
                  </div>
                ` : ''}
                
                <div style="margin: 15px 0;">
                  <strong>📍 Location:</strong> ${emailData.building}${emailData.floor ? `, Floor ${emailData.floor}` : ''}
                </div>
              </div>
              
              <p style="color: #64748b; font-size: 14px;">
                This is an automated confirmation for your room booking. 
                Please contact ${emailData.teacherEmail} if you have any questions.
              </p>
            </div>
          `
        }

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(emailPayload)
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Failed to send email to ${email}: ${response.status} - ${errorText}`)
        }

        const result = await response.json()
        return { email, success: true, messageId: result.id }
      })

      const results = await Promise.allSettled(emailPromises)
      const successful = results.filter(r => r.status === 'fulfilled').length
      const failed = results.filter(r => r.status === 'rejected').length

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Emails sent: ${successful} successful, ${failed} failed`,
          results: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message })
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )

    } catch (emailError) {
      console.error('Error sending emails:', emailError)
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to send emails',
          details: emailError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

  } catch (error) {
    console.error('Error in send-booking-emails function:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
}