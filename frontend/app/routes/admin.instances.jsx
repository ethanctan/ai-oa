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
          <h2>Define Assistant Prompts</h2>
					<div>
						<label htmlFor="initialPrompt">Initial Questions:</label>
						<textarea
							id="initialPrompt"
							name="initialPrompt"
							rows="10"
							cols="50"
							defaultValue="You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project. Interview them about their design decisions and implementation."
						/>
					</div>
					<div>
						<label htmlFor="finalPrompt">Initial Questions:</label>
						<textarea
							id="finalPrompt"
							name="finalPrompt"
							rows="10"
							cols="50"
							defaultValue="You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project. Interview them about their design decisions and implementation."
						/>
					</div>
					<div>
						<label htmlFor="assessmentPrompt">Assessment Criteria:</label>
						<textarea
							id="assessmentPrompt"
							name="assessmentPrompt"
							rows="10"
							cols="50"
							defaultValue="Please review the following code. Consider:
1. Code quality and adherence to best practices
2. Potential bugs or edge cases
3. Performance optimizations
4. Readability and maintainability
5. Any security concerns
Suggest improvements and explain your reasoning for each suggestion."
						/>
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
