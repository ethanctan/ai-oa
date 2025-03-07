// app/routes/index.jsx
import CodeEditor from "~/components/CodeEditor";
import Chat from "~/components/Chat";

export default function Index() {
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ flex: 2, borderRight: "1px solid #333" }}>
        <CodeEditor />
      </div>
      <div style={{ flex: 1 }}>
        <Chat />
      </div>
    </div>
  );
}