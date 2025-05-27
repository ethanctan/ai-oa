import { getApiEndpoint } from "../utils/api";

export async function loader() {
  try {
    console.log("Loading candidates...");
    const res = await fetch(getApiEndpoint("candidates/"));
    if (!res.ok) {
      throw new Error("Failed to fetch candidates");
    }
    const candidates = await res.json();
    return Response.json({ candidates });
  } catch (error) {
    console.error("Error loading candidates:", error);
    return Response.json({ candidates: [], error: error.message });
  }
} 