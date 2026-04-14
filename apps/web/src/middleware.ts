import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes accessible without authentication
const PUBLIC_ROUTES = ['/', '/login', '/register'];
const PUBLIC_PREFIXES = ['/share/', '/universities', '/majors', '/scores'];

// Role-based route prefixes
const ROLE_ROUTES: Record<string, string> = {
  ADMIN: '/admin',
  TEACHER: '/teacher',
  STUDENT: '/student',
};

// Default landing page per role after login
const ROLE_DASHBOARDS: Record<string, string> = {
  ADMIN: '/admin/dashboard',
  TEACHER: '/teacher/dashboard',
  STUDENT: '/student/dashboard',
};

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function getRoleFromToken(token: string): string | null {
  // Decode JWT payload (middle segment) without verification.
  // Full verification happens server-side; middleware only needs a routing hint.
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString()
    );
    return payload.role || null;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Allow public routes unconditionally
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for auth token (cookie first, then Authorization header)
  const token =
    request.cookies.get('access_token')?.value ||
    request.headers.get('authorization')?.replace('Bearer ', '');

  if (!token) {
    // Unauthenticated — redirect to login with return URL
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = getRoleFromToken(token);

  if (!role) {
    // Token is invalid / unparseable — send to login
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based access control: prevent cross-role access
  const rolePrefix = ROLE_ROUTES[role];
  if (rolePrefix && !pathname.startsWith(rolePrefix)) {
    // User is trying to access a route outside their role scope.
    // If it's another role's prefix, redirect to their own dashboard.
    const isOtherRoleRoute = Object.values(ROLE_ROUTES).some(
      (prefix) => pathname.startsWith(prefix)
    );
    if (isOtherRoleRoute) {
      const dashboard = ROLE_DASHBOARDS[role] || '/';
      return NextResponse.redirect(new URL(dashboard, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
