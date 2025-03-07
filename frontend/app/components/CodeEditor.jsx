// app/components/CodeEditor.jsx
import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";

export default function CodeEditor() {
  const [mounted, setMounted] = useState(false);
  const [code, setCode] = useState("// Start coding here...");

  useEffect(() => {
    setMounted(true);
  }, []);
  /**
   * Monaco can only run client-side. 
   * Since hooks only run on the client, this is a simple detector to load Monaco only when this component is mounted on the client.
   */

  if (!mounted) {
    return <div>Loading Editor...</div>;
  }

  return (
    <Editor
      height="100%"
      theme="vs-dark"
      language="javascript"
      value={code}
      onChange={(value) => setCode(value)}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
      }}
    />
  );
}