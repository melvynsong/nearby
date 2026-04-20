
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

export async function middleware(request: NextRequest) {
  // Only protect /nearby/chef route
  if (!request.nextUrl.pathname.startsWith('/nearby/chef')) {
    return NextResponse.next()
  }

  // Use the auth-helpers to get the user session from cookies
  const supabase = createMiddlewareClient({ req: request })
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user?.id) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Check if user is a Chef admin
  const { data } = await supabase
    .from('nearby_admins')
    .select('id')
    .eq('user_id', user.id)
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
