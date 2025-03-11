// app/routes/admin.instances.jsx
import { useLoaderData, Form } from "@remix-run/react";
import { action } from "../actions/instancesAction.jsx";
import { loader } from "../loaders/instancesLoader.jsx";

// Re-export the loader and action so Remix can pick them up
export { loader, action };

export default function InstancesAdmin() {
  const { instances } = useLoaderData();

  return (
    <div className="p-2">
      <h1>Code-Server Instances</h1>
      
      <section>
        <h2>Create New Instance</h2>
        <Form method="post">
          <div>
            <label>
              Instance Name:{" "}
              <input type="text" name="instanceName" required />
            </label>
          </div>
          <div>
            <label>
              GitHub Repo URL:{" "}
              <input type="text" name="githubRepo" placeholder="https://github.com/owner/repo.git" />
            </label>
          </div>
          <div>
            <label>
              GitHub Token (if needed):{" "}
              <input type="text" name="githubToken" placeholder="Personal Access Token" />
            </label>
          </div>
          <div>
            <label>
              Port Mapping:{" "}
              <input type="text" name="portMapping" placeholder="e.g., 8081" />
            </label>
          </div>
          <button type="submit" className="mt-2">
            Create Instance
          </button>
        </Form>
      </section>

      <section className="mt-4">
      <h2>Active Instances</h2>
        {instances.length === 0 ? (
          <p>No active instances.</p>
        ) : (
          <ul>
            {instances.map((instance) => (
              <li key={instance.Id}>
                <strong>{instance.Names.join(", ")}</strong> —{" "}
                {instance.Ports.map((p) => p.PublicPort).join(", ")}
                {" "}
                <Form method="post" style={{ display: "inline" }}>
                  {/* Hidden field to indicate deletion */}
                  <input type="hidden" name="action" value="delete" />
                  <input type="hidden" name="instanceId" value={instance.Id} />
                  <button type="submit" className="ml-2 text-red-500">
                    Delete
                  </button>
                </Form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
