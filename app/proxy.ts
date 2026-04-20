import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Only protect /nearby/chef route
  if (!request.nextUrl.pathname.startsWith('/nearby/chef')) {
    return NextResponse.next();
  }

  // Check for custom session cookie set by your login API
  const hasSession = request.cookies.has('custom_session');
  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}
