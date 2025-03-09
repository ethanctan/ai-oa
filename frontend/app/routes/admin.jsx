// app/routes/admin.jsx

import { Outlet } from "react-router-dom";
// The Outlet component is a placeholder where child routes will be rendered.

export default function Admin() {
    return (
        <div className="p-2">
            <h1>Admin Dashboard</h1>
            <Outlet />
        </div>
    );
 }