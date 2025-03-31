// app/loaders/testsLoader.jsx

// Fetch the list of tests and active instances
export async function loader() {
  try {
    // Fetch tests from the new endpoint
    const testsRes = await fetch("http://127.0.0.1:3000/tests/");
    if (!testsRes.ok) {
      throw new Error("Failed to fetch tests");
    }
    const tests = await testsRes.json();
    
    // Also fetch the active instances
    const instancesRes = await fetch("http://127.0.0.1:3000/instances/");
    if (!instancesRes.ok) {
      throw new Error("Failed to fetch instances");
    }
    const instances = await instancesRes.json();
    
    return Response.json({ tests, instances });
  } catch (error) {
    console.error("Error loading tests:", error);
    return Response.json({ tests: [], instances: [], error: error.message });
  }
} 