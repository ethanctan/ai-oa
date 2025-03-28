// app/actions/instancesCreateNew.jsx
import fetch from "node-fetch";

// Handle form submissions to create or delete instances
export async function action({ request }) {
  const formData = await request.formData();
  const actionType = formData.get("action");

  // If deletion is requested
  if (actionType === "delete") {
    const instanceId = formData.get("instanceId");
    const response = await fetch(`http://localhost:3000/instances/${instanceId}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      throw new Error("Failed to delete instance");
    }
    const result = await response.json();
    return Response.json(result);
  }
  
  // Otherwise create a new instance
  const instanceName = formData.get("instanceName");
  const githubRepo = formData.get("githubRepo");
  const githubToken = formData.get("githubToken");
  const portMapping = formData.get("portMapping");
  
  const payload = { instanceName, githubRepo, githubToken, portMapping };
  
  const response = await fetch("http://localhost:3000/instances", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    console.log(response)
    throw new Error("Failed to create instance: See console")
  }
  const result = await response.json();
  return Response.json(result);
}