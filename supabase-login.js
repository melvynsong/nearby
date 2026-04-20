// Simple Supabase phone OTP login script for Node.js
// Usage: node supabase-login.js <phone> <otp_code>

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://YOUR_SUPABASE_PROJECT.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function sendOtp(phone) {
  const { error } = await supabase.auth.signInWithOtp({ phone })
  if (error) {
    console.error('Error sending OTP:', error.message)
  } else {
    console.log('OTP sent to', phone)
  }
}

async function verifyOtp(phone, token) {
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
  })
  if (error) {
    console.error('Error verifying OTP:', error.message)
  } else {
    console.log('Logged in! Session:', data.session)
  }
}

const [,, phone, otp] = process.argv

if (!phone) {
  console.log('Usage: node supabase-login.js <phone> <otp_code>')
  process.exit(1)
}

if (!otp) {
  // Step 1: Send OTP
  sendOtp(phone)
} else {
  // Step 2: Verify OTP
  verifyOtp(phone, otp)
}
