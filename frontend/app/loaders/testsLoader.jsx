// app/loaders/testsLoader.jsx

import { getApiEndpoint } from "../utils/api";

// Fetch only instances since tests require authentication
export async function loader() {
  try {
    // Only fetch instances - tests will be fetched client-side with authentication
    const instancesRes = await fetch(getApiEndpoint("instances/"));
    if (!instancesRes.ok) {
      throw new Error("Failed to fetch instances");
    }
    const instances = await instancesRes.json();
    
    // Return empty tests array since we'll fetch it client-side
    return { tests: [], instances };
  } catch (error) {
    console.error("Error loading data:", error);
    return { tests: [], instances: [] };
  }
} 