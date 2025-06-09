import type { LoaderFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useSearchParams } from "@remix-run/react";

import { auth, getSession } from "~/utils/auth.server";

type LoaderData = {
  error?: string;
};

export const loader: LoaderFunction = async ({ request }) => {
  // Check if user is already authenticated
  try {
    const user = await auth.authenticate("auth0", request);
    if (user) {
      return redirect("/admin/candidates");
    }
  } catch {
    // User not authenticated, continue to login page
  }

  // Check for error in search params
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  
  return json<LoaderData>({ 
    error: error === "auth_failed" ? "Authentication failed. Please try again." : undefined 
  });
};

export default function Login() {
  const { error } = useLoaderData<LoaderData>();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to Assessment Platform
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Access your assessment dashboard
          </p>
        </div>
        <div className="mt-8 space-y-6">
          {error ? (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          ) : null}
          <Form method="post" action="/auth/auth0">
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign In with Auth0
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
} 