// Get the API URL from environment variables, fallback to development URL
// In Vite/Remix, we need to use import.meta.env for client-side env vars
const getApiUrl = () => {
    // Try multiple ways to get the API URL
    const apiUrl = import.meta.env.VITE_API_URL || 
                   process.env.VITE_API_URL || 
                   'http://127.0.0.1:3000';
    
    return apiUrl;
};

export const VITE_API_URL = getApiUrl();

// Helper function to construct API endpoints
export const getApiEndpoint = (path) => {
    // Remove leading slash if present to avoid double slashes
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const endpoint = `${VITE_API_URL}/${cleanPath}`;

    return endpoint;
}; 