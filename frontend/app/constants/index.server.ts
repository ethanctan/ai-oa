// Debug environment variables
console.log("🔍 ENV DEBUG: All process.env keys:", Object.keys(process.env));
console.log("🔍 ENV DEBUG: VITE_API_URL value:", process.env.VITE_API_URL);
console.log("🔍 ENV DEBUG: NODE_ENV:", process.env.NODE_ENV);

export const AUTH0_RETURN_TO_URL = process.env.AUTH0_RETURN_TO_URL!;
export const AUTH0_CALLBACK_URL = process.env.AUTH0_CALLBACK_URL!;
export const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID!;
export const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET!;
export const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN!;
export const AUTH0_LOGOUT_URL = process.env.AUTH0_LOGOUT_URL!;
export const SECRETS = process.env.SECRETS!;
export const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'; 