import { useRouteLoaderData } from '@remix-run/react';
import { getApiEndpoint } from '../utils/api';

// Custom hook for authenticated API calls that works with Auth0 session
export function useAuthenticatedApi() {
  // Get the authenticated user from the admin route loader data
  const adminData = useRouteLoaderData('routes/admin');
  const user = adminData?.user;

  const makeAuthenticatedRequest = async (endpoint, options = {}) => {
    if (!user) {
      console.error('useAuthenticatedApi: User not authenticated');
      throw new Error('User not authenticated');
    }

    const url = getApiEndpoint(endpoint);
    
    // Add authentication and company context headers
    const headers = {
      // Include user context for multi-tenancy
      'X-User-ID': user.id,
      'X-Company-ID': user.companyId.toString(),
      'X-Auth0-User-ID': user.auth0UserId,
      ...options.headers,
    };
    
    // Only set Content-Type to JSON if we're not sending FormData
    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }
    
    // Make the request with authentication context
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Include cookies for session-based auth
    });

    // Handle authentication errors
    if (response.status === 401) {
      console.error('useAuthenticatedApi: 401 Unauthorized - redirecting to login');
      // Redirect to login if unauthorized
      window.location.href = '/login';
      throw new Error('Authentication required');
    }
    
    if (response.status === 403) {
      console.error('useAuthenticatedApi: 403 Forbidden');
      throw new Error('Access forbidden - insufficient permissions');
    }
    
    return response;
  };

  const get = async (endpoint) => {
    return makeAuthenticatedRequest(endpoint, {
      method: 'GET',
    });
  };

  const post = async (endpoint, data) => {
    return makeAuthenticatedRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  };

  const put = async (endpoint, data) => {
    return makeAuthenticatedRequest(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  };

  const del = async (endpoint) => {
    return makeAuthenticatedRequest(endpoint, {
      method: 'DELETE',
    });
  };

  // Helper method for file uploads (FormData)
  const uploadFile = async (endpoint, formData) => {
    return makeAuthenticatedRequest(endpoint, {
      method: 'POST',
      body: formData,
      // Don't set any headers - let makeAuthenticatedRequest handle auth headers
      // and let browser set Content-Type with proper boundary for FormData
    });
  };

  return {
    get,
    post,
    put,
    delete: del,
    uploadFile,
    makeAuthenticatedRequest,
    user, // Expose user data for components that need it
    isAuthenticated: !!user,
  };
} 