import fetch from "node-fetch";
import { redirect } from "@remix-run/node";
import { getApiEndpoint } from "../utils/api";

// Handle form submissions to create or delete tests
export async function action({ request }) {
  const formData = await request.formData();
  const action = formData.get("action");

  try {
    let response;
    switch (action) {
      case "delete":
        const deleteTestId = formData.get("testId");
        const deleteInstanceId = formData.get("instanceId");
        
        if (deleteTestId) {
          // Delete test
          response = await fetch(getApiEndpoint(`tests/${deleteTestId}`), {
            method: "DELETE",
          });
        } else if (deleteInstanceId) {
          // Delete instance
          response = await fetch(getApiEndpoint(`instances/${deleteInstanceId}`), {
            method: "DELETE",
          });
        }
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to delete");
        }
        
        // Return to the same page after deletion
        return redirect("/admin/tests");
      
      case "updateTest":
        const updateTestId = formData.get("testId");
        const testData = JSON.parse(formData.get("testData"));
        response = await fetch(getApiEndpoint(`tests/${updateTestId}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testData),
        });
        break;

      case "updateInstance":
        const updateInstanceId = formData.get("instanceId");
        const instanceData = JSON.parse(formData.get("instanceData"));
        response = await fetch(getApiEndpoint(`instances/${updateInstanceId}`), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(instanceData),
        });
        break;

      case "createTest":
        const newTestData = JSON.parse(formData.get("testData"));
        response = await fetch(getApiEndpoint("tests"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newTestData),
        });
        break;

      default: // Default action is to create a test
        // Extract form data and prepare payload
        const formEntries = Array.from(formData.entries());
        const payload = {};
        
        // Convert FormData to a regular object for the API
        formEntries.forEach(([key, value]) => {
          // Skip the action field
          if (key !== "action") {
            // Handle cases where multiple values might exist for a key (like candidateIds)
            if (key === "candidateIds") {
              if (!payload[key]) {
                payload[key] = [];
              }
              payload[key].push(value);
            } else {
              payload[key] = value;
            }
          }
        });

        // Handle timer configuration JSON if present
        if (payload.timerConfigJson) {
          try {
            const timerConfig = JSON.parse(payload.timerConfigJson);
            payload.enableTimer = timerConfig.enableTimer;
            payload.timerDuration = timerConfig.duration;
            
            // Add project timer configuration
            payload.enableProjectTimer = timerConfig.enableProjectTimer;
            payload.projectTimerDuration = timerConfig.projectDuration;
            
            // Remove the raw JSON from the payload
            delete payload.timerConfigJson;
          } catch (e) {
            console.error('Failed to parse timer configuration:', e);
          }
        }
        
        // Create the test
        response = await fetch(getApiEndpoint("tests"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to create test");
        }
        
        // Return to the tests page after creation
        return redirect("/admin/tests");
    }
  } catch (error) {
    console.error("Error in tests action:", error);
    // In a real app, you would handle the error more gracefully
    return { error: error.message };
  }
} 