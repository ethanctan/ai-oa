import { redirect } from "@remix-run/node";

export async function loader() {
  // Redirect to candidates page by default
  return redirect("/admin/candidates");
} 