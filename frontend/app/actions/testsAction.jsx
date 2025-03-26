import fetch from "node-fetch";

// Handle form submissions to create or delete tests
export async function action({ request }) {
  const formData = await request.formData();
  const actionType = formData.get("action");

  // If deletion is requested
  if (actionType === "delete") {
    const instanceId = formData.get("instanceId");
    
    try {
      // First try to delete using the new tests endpoint if we have a test ID
      const testId = formData.get("testId");
      if (testId) {
        const response = await fetch(`http://localhost:3000/tests/${testId}`, {
          method: "DELETE"
        });
        
        if (response.ok) {
          const result = await response.json();
          return Response.json(result);
        }
      }
      
      // Fall back to the old instances endpoint for backward compatibility
      const response = await fetch(`http://localhost:3000/instances/${instanceId}`, {
        method: "DELETE"
      });
      
      if (!response.ok) {
        throw new Error("Failed to delete test");
      }
      
      const result = await response.json();
      return Response.json(result);
    } catch (error) {
      console.error("Error deleting test:", error);
      return Response.json({ error: error.message }, { status: 500 });
    }
  }
  
  // For test creation
  const instanceName = formData.get("instanceName");
  const githubRepo = formData.get("githubRepo");
  const githubToken = formData.get("githubToken");
  const initialPrompt = formData.get("initialPrompt");
  const finalPrompt = formData.get("finalPrompt");
  const assessmentPrompt = formData.get("assessmentPrompt");
  
  // Get the selected candidate IDs
  const candidateIds = formData.getAll("candidateIds");
  
  // Create the payload with all the form data
  const payload = { 
    instanceName, 
    githubRepo, 
    githubToken, 
    initialPrompt, 
    finalPrompt, 
    assessmentPrompt,
    candidateIds: candidateIds.length > 0 ? candidateIds : []
  };
  
  try {
    // Send request to create new test using the new endpoint
    const response = await fetch("http://localhost:3000/tests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Failed to create test: ${errorData}`);
    }
    
    const result = await response.json();
    return Response.json(result);
  } catch (error) {
    console.error("Error creating test:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
} 