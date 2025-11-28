// app/routes/admin.jsx

import { Outlet, Link, useLocation, Form, useLoaderData } from "@remix-run/react";
import { json, redirect } from "@remix-run/node";
import { auth } from "~/utils/auth.server";

export const meta = () => {
  return [
    { title: "Verihire - Admin Dashboard", }
  ];
};

export const loader = async ({ request }) => {
  try {
    // Check if user is authenticated
    const user = await auth.authenticate("auth0", request);
    if (!user) {
      return redirect("/login");
    }
    return json({ user });
  } catch (error) {
    // If auth fails, redirect to login
    return redirect("/login");
  }
};

// The Outlet component is a placeholder where child routes will be rendered.
export default function Admin() {
    const { user } = useLoaderData();
    const location = useLocation();
    const currentPath = location.pathname;
    
    return (
        <div className="p-4 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Verihire</h1>
                <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-600">
                        Welcome, {user?.name || user?.email}
                    </span>
                    <Form method="post" action="/logout">
                        <button 
                            type="submit"
                            className="bg-red-500 hover:bg-red-700 text-white font-bold py-2 px-4 rounded text-sm"
                        >
                            Logout
                        </button>
                    </Form>
                </div>
            </div>
            
            <nav className="mb-6">
                <ul className="flex border-b">
                    <li className="mr-1">
                        <Link 
                            to="/admin/candidates" 
                            className={`inline-block px-4 py-2 ${
                                currentPath === "/admin/candidates" 
                                ? "border-l border-t border-r rounded-t bg-white text-blue-600" 
                                : "text-blue-500 hover:text-blue-800"
                            }`}
                        >
                            Candidates
                        </Link>
                    </li>
                    <li className="mr-1">
                        <Link 
                            to="/admin/tests" 
                            className={`inline-block px-4 py-2 ${
                                currentPath === "/admin/tests" 
                                ? "border-l border-t border-r rounded-t bg-white text-blue-600" 
                                : "text-blue-500 hover:text-blue-800"
                            }`}
                        >
                            Tests
                        </Link>
                    </li>
                </ul>
            </nav>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
                <Outlet />
            </div>
        </div>
    );
}