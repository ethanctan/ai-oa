import type { LoaderFunction } from "@remix-run/node";
import { auth } from "~/utils/auth.server";

export const loader: LoaderFunction = async ({ request }) => {  
  // Don't wrap in try/catch - let remix-auth handle the redirects
  return await auth.authenticate("auth0", request, {
    successRedirect: "/admin/candidates",
    failureRedirect: "/login?error=auth_failed",
  });
}; 