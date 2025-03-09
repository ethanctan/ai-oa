// app/loaders/instancesFetchExisting.jsx

// Fetch the list of active instances of code-server from the Docker API
export async function loader() {
    const res = await fetch("http://localhost:3000/instances");
    if (!res.ok) {
      throw new Error("Failed to fetch instances");
    }
    const instances = await res.json();
    return Response.json({ instances });
  }