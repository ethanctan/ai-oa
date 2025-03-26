export async function loader() {
  try {
    const res = await fetch("http://localhost:3000/candidates");
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