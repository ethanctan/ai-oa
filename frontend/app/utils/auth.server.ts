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
  API_URL,
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
    try {
      // Look up or create user in database based on Auth0 profile
      const user = await getUserFromAuth0Profile(profile);
      return user;
    } catch (error) {
      throw error;
    }
  }
);

auth.use(auth0Strategy);

export const { getSession, commitSession, destroySession } = sessionStorage;

// Helper function to get or create user from Auth0 profile
async function getUserFromAuth0Profile(profile: Auth0Profile): Promise<User> {  
  const endpoint = `${API_URL}/auth/profile`;
  
  const profileData = {
    auth0UserId: profile.id,
    email: profile.emails?.[0]?.value,
    name: profile.displayName || (profile.name?.givenName && profile.name?.familyName 
      ? `${profile.name.givenName} ${profile.name.familyName}` 
      : 'Unknown User'),
  };
  
  try {
    
    // This will make an API call to your backend to get/create the user
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profileData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
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

    return mappedUserData;
  } catch (error) {
    console.error("AUTH FRONTEND: Error in getUserFromAuth0Profile:");
    console.error("   - Error:", error);
    if (error instanceof Error) {
      console.error("   - Error message:", error.message);
      console.error("   - Error stack:", error.stack);
    }
    throw error;
  }
} 