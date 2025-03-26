// app/routes/admin.jsx

import { Outlet, Link, useLocation } from "react-router-dom";
// The Outlet component is a placeholder where child routes will be rendered.

export default function Admin() {
    const location = useLocation();
    const currentPath = location.pathname;
    
    return (
        <div className="p-4 max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>
            
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