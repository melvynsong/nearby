
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Only protect /nearby/chef route
  if (!request.nextUrl.pathname.startsWith('/nearby/chef')) {
    return NextResponse.next()
  }

  // Minimal session cookie check (adjust cookie name if needed)
  const hasSession = request.cookies.has('sb-access-token')
  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // For full admin check, do it in your page or API route
  return NextResponse.next()
}

export const config = {
  matcher: ['/nearby/chef/:path*'],
}
