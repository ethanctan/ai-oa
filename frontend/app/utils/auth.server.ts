import { createCookieSessionStorage } from "@remix-run/node";
import { Authenticator } from "remix-auth";
import type { Auth0Profile } from "remix-auth-auth0";
import { Auth0Strategy } from "remix-auth-auth0";

import {
  AUTH0_CALLBACK_URL,
  AUTH0_CLIENT_ID,
  AUTH0_CLIENT_SECRET,
  AUTH0_DOMAIN,
  SECRETS,
} from "~/constants/index.server";

// Custom user type that includes company info
export interface User {
  id: string;
  auth0UserId: string;
  email: string;
  name: string;
  companyId: number;
  companyName: string;
  role: string;
}

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "_remix_session",
    sameSite: "lax",
    path: "/",
    httpOnly: true,
    secrets: [SECRETS],
    secure: process.env.NODE_ENV === "production",
  },
});

export const auth = new Authenticator<User>(sessionStorage);

const auth0Strategy = new Auth0Strategy(
  {
    callbackURL: AUTH0_CALLBACK_URL,
    clientID: AUTH0_CLIENT_ID,
    clientSecret: AUTH0_CLIENT_SECRET,
    domain: AUTH0_DOMAIN,
  },
  async ({ profile }) => {
    console.log("🚀 AUTH FRONTEND: Auth0 strategy callback triggered");
    console.log("👤 AUTH FRONTEND: Auth0 profile received:");
    console.log("   - Profile ID:", profile.id);
    console.log("   - Profile emails:", profile.emails);
    console.log("   - Profile displayName:", profile.displayName);
    console.log("   - Profile name:", profile.name);
    console.log("   - Full profile keys:", Object.keys(profile));
    
    try {
      // Look up or create user in database based on Auth0 profile
      console.log("🔄 AUTH FRONTEND: Calling getUserFromAuth0Profile");
      const user = await getUserFromAuth0Profile(profile);
      console.log("✅ AUTH FRONTEND: Successfully got user from Auth0 profile:", user);
      return user;
    } catch (error) {
      console.error("❌ AUTH FRONTEND: Error in Auth0 strategy callback:", error);
      throw error;
    }
  }
);

auth.use(auth0Strategy);

export const { getSession, commitSession, destroySession } = sessionStorage;

// Helper function to get or create user from Auth0 profile
async function getUserFromAuth0Profile(profile: Auth0Profile): Promise<User> {
  console.log("🚀 AUTH FRONTEND: getUserFromAuth0Profile - Starting");
  
  const apiUrl = process.env.API_BASE_URL || 'http://localhost:3000';
  const endpoint = `${apiUrl}/auth/profile`;
  
  const profileData = {
    auth0UserId: profile.id,
    email: profile.emails?.[0]?.value,
    name: profile.displayName || (profile.name?.givenName && profile.name?.familyName 
      ? `${profile.name.givenName} ${profile.name.familyName}` 
      : 'Unknown User'),
  };
  
  console.log("📋 AUTH FRONTEND: Profile data to send:");
  console.log("   - API URL:", apiUrl);
  console.log("   - Endpoint:", endpoint);
  console.log("   - Profile data:", profileData);
  
  try {
    console.log("📤 AUTH FRONTEND: Making API call to backend...");
    
    // This will make an API call to your backend to get/create the user
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profileData),
    });

    console.log("📥 AUTH FRONTEND: Received response from backend:");
    console.log("   - Status:", response.status);
    console.log("   - Status Text:", response.statusText);
    console.log("   - Headers:", Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ AUTH FRONTEND: Backend response not OK:");
      console.error("   - Status:", response.status);
      console.error("   - Error text:", errorText);
      
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
        console.error("   - Error JSON:", errorJson);
      } catch (e) {
        console.error("   - Could not parse error as JSON");
      }
      
      throw new Error(`Failed to get user profile: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const backendUserData = await response.json();
    console.log("✅ AUTH FRONTEND: Successfully received user data from backend:");
    console.log("   - Backend user data:", backendUserData);
    console.log("   - Backend user keys:", Object.keys(backendUserData));
    
    // Map backend response (snake_case) to frontend User interface (camelCase)
    const mappedUserData: User = {
      id: backendUserData.id.toString(), // Convert number to string
      auth0UserId: backendUserData.auth0_user_id, // Map snake_case to camelCase
      email: backendUserData.email,
      name: backendUserData.name,
      companyId: backendUserData.company_id, // Map snake_case to camelCase
      companyName: backendUserData.companyName,
      role: backendUserData.role
    };
    
    console.log("🔄 AUTH FRONTEND: Mapped user data for frontend:");
    console.log("   - Mapped user data:", mappedUserData);
    console.log("   - Mapped user keys:", Object.keys(mappedUserData));
    
    return mappedUserData;
  } catch (error) {
    console.error("❌ AUTH FRONTEND: Error in getUserFromAuth0Profile:");
    console.error("   - Error:", error);
    if (error instanceof Error) {
      console.error("   - Error message:", error.message);
      console.error("   - Error stack:", error.stack);
    }
    throw error;
  }
} 