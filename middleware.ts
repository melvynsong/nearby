import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function middleware(request: NextRequest) {
  // Only protect /nearby/chef route
  if (!request.nextUrl.pathname.startsWith('/nearby/chef')) {
    return NextResponse.next()
  }

  // Get user session from cookies
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Check if user is a Chef admin
  const { data } = await supabase
    .from('nearby_admins')
    .select('id')
    .eq('user_id', session.user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (!data) {
    return NextResponse.redirect(new URL('/access-denied', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/nearby/chef/:path*'],
}
