// Get the API URL from environment variables, fallback to development URL
export const API_URL = process.env.API_URL || 'http://127.0.0.1:3000';

// Helper function to construct API endpoints
export const getApiEndpoint = (path) => {
    // Remove leading slash if present to avoid double slashes
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${API_URL}/${cleanPath}`;
}; 