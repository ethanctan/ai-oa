// Get the API URL from environment variables, fallback to development URL
// In Vite/Remix, we need to use import.meta.env for client-side env vars
const getApiUrl = () => {
    // Try multiple ways to get the API URL
    const apiUrl = import.meta.env.VITE_API_URL || 
                   import.meta.env.API_URL || 
                   process.env.VITE_API_URL || 
                   process.env.API_URL || 
                   'http://127.0.0.1:3000';
    
    console.log('🔧 API Configuration Debug:');
    console.log('   - import.meta.env.VITE_API_URL:', import.meta.env.VITE_API_URL);
    console.log('   - import.meta.env.API_URL:', import.meta.env.API_URL);
    console.log('   - process.env.VITE_API_URL:', process.env.VITE_API_URL);
    console.log('   - process.env.API_URL:', process.env.API_URL);
    console.log('   - Final API_URL:', apiUrl);
    
    return apiUrl;
};

export const API_URL = getApiUrl();

// Helper function to construct API endpoints
export const getApiEndpoint = (path) => {
    // Remove leading slash if present to avoid double slashes
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    const endpoint = `${API_URL}/${cleanPath}`;
    
    console.log('🌐 API Endpoint Debug:');
    console.log('   - Path:', path);
    console.log('   - Clean path:', cleanPath);
    console.log('   - Full endpoint:', endpoint);
    
    return endpoint;
}; 