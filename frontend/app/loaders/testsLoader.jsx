// app/loaders/testsLoader.jsx

import { getApiEndpoint } from "../utils/api";

// Fetch the list of tests and active instances
export async function loader() {
  try {
    // Fetch tests from the new endpoint
    const testsRes = await fetch(getApiEndpoint("tests/"));
    if (!testsRes.ok) {
      throw new Error("Failed to fetch tests");
    }
    const tests = await testsRes.json();
    
    // Also fetch the active instances
    const instancesRes = await fetch(getApiEndpoint("instances/"));
    if (!instancesRes.ok) {
      throw new Error("Failed to fetch instances");
    }
    const instances = await instancesRes.json();
    
    return { tests, instances };
  } catch (error) {
    console.error("Error loading tests:", error);
    return { tests: [], instances: [] };
  }
} 