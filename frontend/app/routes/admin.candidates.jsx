import { useLoaderData, useSubmit } from "@remix-run/react";
import { loader } from "../loaders/candidatesLoader.jsx";
import { useState } from "react";
import { getApiEndpoint } from "../utils/api";

// Re-export the loader so Remix can pick it up
export { loader };

export default function CandidatesAdmin() {
  const { candidates } = useLoaderData();
  const [uploadStatus, setUploadStatus] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const submit = useSubmit();

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Reset status
    setUploadStatus(null);
    setIsUploading(true);

    // Validate file type
    if (!file.name.match(/\.(csv|xlsx|xls)$/)) {
      setUploadStatus({
        type: 'error',
        message: 'Please upload a CSV or Excel file'
      });
      setIsUploading(false);
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(getApiEndpoint('candidates/upload'), {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json'
        }
      });

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server returned non-JSON response');
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      setUploadStatus({
        type: 'success',
        message: `Successfully added ${result.success.length} candidates. ${result.errors.length} errors.`
      });

      // Refresh the page to show new candidates
      window.location.reload();
    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: error.message || 'Failed to upload file. Please try again.'
      });
    } finally {
      setIsUploading(false);
      // Reset the file input
      event.target.value = '';
    }
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <h2 className="text-2xl font-semibold">Candidates</h2>
        <div className="flex flex-col items-end">
          <div className="relative">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
              disabled={isUploading}
            />
            <label
              htmlFor="file-upload"
              className={`bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded cursor-pointer ${
                isUploading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isUploading ? 'Uploading...' : 'Upload Candidates'}
            </label>
          </div>
          <p className="text-sm text-gray-500 mt-5">
            .csv and .xlsx files are supported. Ensure the file contains two columns: 'Name' and 'Email'.
          </p>
        </div>
      </div>

      {uploadStatus && (
        <div className={`mb-4 p-4 rounded ${
          uploadStatus.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {uploadStatus.message}
        </div>
      )}

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