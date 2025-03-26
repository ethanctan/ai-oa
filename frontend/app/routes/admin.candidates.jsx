import { useLoaderData } from "@remix-run/react";
import { loader } from "../loaders/candidatesLoader.jsx";

// Re-export the loader so Remix can pick it up
export { loader };

export default function CandidatesAdmin() {
  const { candidates } = useLoaderData();

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Candidates</h2>
        <p className="text-sm text-gray-500">
          Candidates are automatically added through job applications
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg overflow-hidden">
          <thead className="bg-gray-100">
            <tr>
              <th className="py-3 px-4 text-left font-medium text-gray-600">Name</th>
              <th className="py-3 px-4 text-left font-medium text-gray-600">Email</th>
              <th className="py-3 px-4 text-left font-medium text-gray-600">Tests Assigned</th>
              <th className="py-3 px-4 text-left font-medium text-gray-600">Status</th>
              <th className="py-3 px-4 text-left font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {candidates.map((candidate) => (
              <tr key={candidate.id}>
                <td className="py-3 px-4">{candidate.name}</td>
                <td className="py-3 px-4">{candidate.email}</td>
                <td className="py-3 px-4">
                  {candidate.testsAssigned && candidate.testsAssigned.length > 0 ? (
                    candidate.testsAssigned.map((test, index) => (
                      <span 
                        key={index} 
                        className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mr-1 mb-1"
                      >
                        {test.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500">No tests assigned</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  <span 
                    className={`px-2 py-1 rounded text-xs ${
                      candidate.completed 
                        ? "bg-green-100 text-green-800" 
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {candidate.completed ? "Completed" : "Pending"}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <button 
                    className="text-blue-600 hover:text-blue-800"
                    onClick={() => alert(`View results for ${candidate.name}`)}
                  >
                    {candidate.completed ? "View Results" : "Send Reminder"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 