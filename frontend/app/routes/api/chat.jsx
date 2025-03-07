// app/routes/api/chat.jsx
export async function action({ request }) {
    const { messages } = await request.json();
  
    // Here you would normally call your AI backend (e.g., OpenAI API).
    // For demonstration, we return a dummy response.
    const reply = "This is a simulated response based on your input.";
    
    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  
  export function loader() {
    // Optionally handle GET requests if needed.
    return null;
  }
  