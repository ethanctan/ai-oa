import fetch from "node-fetch";

// Handle form submissions to create or delete tests
export async function action({ request }) {
  const formData = await request.formData();
  const actionType = formData.get("action");

  // If deletion is requested
  if (actionType === "delete") {
    try {
      // Check whether we're deleting a test or an instance
      const testId = formData.get("testId");
      const instanceId = formData.get("instanceId");
      
      let response;
      
      // Delete a test if testId is provided
      if (testId) {
        console.log(`Deleting test with ID: ${testId}`);
        response = await fetch(`http://localhost:3000/tests/${testId}`, {
          method: "DELETE"
        });
      } 
      // Delete an instance if instanceId is provided
      else if (instanceId) {
        console.log(`Deleting instance with ID: ${instanceId}`);
        response = await fetch(`http://localhost:3000/instances/${instanceId}`, {
          method: "DELETE"
        });
      } else {
        throw new Error("No test ID or instance ID provided for deletion");
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server error response:", errorText);
        throw new Error(`Failed to delete: ${errorText}`);
      }
      
      const result = await response.json();
      return Response.json(result);
    } catch (error) {
      console.error("Error in delete action:", error);
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