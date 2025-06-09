import { useRouteLoaderData } from '@remix-run/react';

/**
 * Simple auth hook that provides access to the authenticated user
 * from the admin route loader data. This works with the existing
 * server-side Auth0 authentication in Remix.
 */
export function useAuth() {
  // Get the authenticated user from the admin route loader data
  const adminData = useRouteLoaderData('routes/admin');
  const user = adminData?.user;

  return {
    user,
    isAuthenticated: !!user,
    isLoading: false, // In Remix, loading is handled by the route loader
    
    // User properties for easy access
    userId: user?.id,
    email: user?.email,
    name: user?.name,
    companyId: user?.companyId,
    companyName: user?.companyName,
    role: user?.role,
    auth0UserId: user?.auth0UserId,
  };
} 