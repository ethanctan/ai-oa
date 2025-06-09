import type { LoaderFunction } from "@remix-run/node";
import { auth } from "~/utils/auth.server";

export const loader: LoaderFunction = async ({ request }) => {
  console.log("🚀 AUTH CALLBACK: Starting auth callback loader");
  console.log("📥 AUTH CALLBACK: Request URL:", request.url);
  console.log("📥 AUTH CALLBACK: Request method:", request.method);
  console.log("📥 AUTH CALLBACK: Request headers:", Object.fromEntries(request.headers.entries()));
  
  console.log("🔄 AUTH CALLBACK: Calling auth.authenticate with Auth0");
  
  // Don't wrap in try/catch - let remix-auth handle the redirects
  return await auth.authenticate("auth0", request, {
    successRedirect: "/admin/candidates",
    failureRedirect: "/login?error=auth_failed",
  });
}; 