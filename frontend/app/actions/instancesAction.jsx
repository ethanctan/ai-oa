// app/actions/instancesCreateNew.jsx
import fetch from "node-fetch";

// Handle form submissions to create a new instance of code-server
export async function action({ request }) {
    const formData = await request.formData();
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
      throw new Error("Failed to create instance");
    }
    const result = await response.json();
    return Response.json(result);
  }