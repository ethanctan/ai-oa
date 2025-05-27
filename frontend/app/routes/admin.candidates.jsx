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
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateData, setDuplicateData] = useState(null);
  const [duplicateDecisions, setDuplicateDecisions] = useState({});
  const submit = useSubmit();

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Reset status
    setUploadStatus(null);
    setIsUploading(true);
    setDuplicateData(null);
    setDuplicateDecisions({});

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

      // Check if there are duplicates to resolve
      if (result.duplicates && result.duplicates.length > 0) {
        setDuplicateData(result.duplicates);
        setShowDuplicateModal(true);
      } else {
        setUploadStatus({
          type: 'success',
          message: `Successfully added ${result.success.length} candidates. ${result.errors.length} errors.`
        });
        // Refresh the page to show new candidates
        window.location.reload();
      }
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

  const handleDuplicateResolution = async () => {
    if (!duplicateData) return;

    try {
      // Convert decisions object to array format expected by the API
      const decisions = duplicateData.map((item, index) => {
        const decision = duplicateDecisions[index] || { action: 'skip' };
        return {
          new: item.new,
          action: decision.action,
          existing_id: decision.existing_id
        };
      });

      const response = await fetch(getApiEndpoint('candidates/resolve-duplicates'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(decisions)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to resolve duplicates');
      }

      setUploadStatus({
        type: 'success',
        message: `Successfully processed ${result.success.length} candidates. ${result.errors.length} errors.`
      });

      // Close modal and refresh
      setShowDuplicateModal(false);
      setDuplicateData(null);
      setDuplicateDecisions({});
      window.location.reload();
    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: error.message || 'Failed to resolve duplicates. Please try again.'
      });
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
            .csv and .xlsx files are supported. File should contain columns: 'Name', 'Email', and optional 'Tags' (semicolon-separated, e.g. "frontend developer; javascript").<br />
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

      {/* Duplicate Resolution Modal */}
      {showDuplicateModal && duplicateData && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-4xl w-full max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Resolve Duplicate Candidates</h3>
              <button 
                onClick={() => {
                  setShowDuplicateModal(false);
                  setDuplicateData(null);
                  setDuplicateDecisions({});
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                &times;
              </button>
            </div>

            <div className="space-y-6">
              {duplicateData.map((item, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-4">
                  <div className="mb-4">
                    <h4 className="font-medium text-lg mb-2">New Candidate Data:</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Name</p>
                        <p className="font-medium">{item.new.name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Email</p>
                        <p className="font-medium">{item.new.email}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm text-gray-600">Tags</p>
                        <p className="font-medium">{item.new.tags || 'No tags'}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <h4 className="font-medium text-lg mb-2">Existing Matches:</h4>
                    <div className="space-y-2">
                      {item.existing.map((existing, existingIndex) => (
                        <div key={existingIndex} className="border border-gray-100 rounded p-2">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-gray-600">Name</p>
                              <p className="font-medium">{existing.name}</p>
                            </div>
                            <div>
                              <p className="text-sm text-gray-600">Email</p>
                              <p className="font-medium">{existing.email}</p>
                            </div>
                            <div className="col-span-2">
                              <p className="text-sm text-gray-600">Tags</p>
                              <p className="font-medium">{existing.tags || 'No tags'}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        name={`action-${index}`}
                        value="create_new"
                        checked={duplicateDecisions[index]?.action === 'create_new'}
                        onChange={() => setDuplicateDecisions({
                          ...duplicateDecisions,
                          [index]: { action: 'create_new' }
                        })}
                        className="form-radio"
                      />
                      <span className="ml-2">Create as new candidate</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        name={`action-${index}`}
                        value="update"
                        checked={duplicateDecisions[index]?.action === 'update'}
                        onChange={() => setDuplicateDecisions({
                          ...duplicateDecisions,
                          [index]: { 
                            action: 'update',
                            existing_id: item.existing[0].id // Default to first match
                          }
                        })}
                        className="form-radio"
                      />
                      <span className="ml-2">Update existing candidate</span>
                    </label>
                    <label className="inline-flex items-center">
                      <input
                        type="radio"
                        name={`action-${index}`}
                        value="skip"
                        checked={duplicateDecisions[index]?.action === 'skip' || !duplicateDecisions[index]}
                        onChange={() => setDuplicateDecisions({
                          ...duplicateDecisions,
                          [index]: { action: 'skip' }
                        })}
                        className="form-radio"
                      />
                      <span className="ml-2">Skip (keep existing)</span>
                    </label>
                  </div>

                  {duplicateDecisions[index]?.action === 'update' && item.existing.length > 1 && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700">
                        Select which existing candidate to update:
                      </label>
                      <select
                        value={duplicateDecisions[index]?.existing_id || ''}
                        onChange={(e) => setDuplicateDecisions({
                          ...duplicateDecisions,
                          [index]: {
                            action: 'update',
                            existing_id: parseInt(e.target.value)
                          }
                        })}
                        className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                      >
                        {item.existing.map((existing) => (
                          <option key={existing.id} value={existing.id}>
                            {existing.name} ({existing.email})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end space-x-4">
              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  setDuplicateData(null);
                  setDuplicateDecisions({});
                }}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={handleDuplicateResolution}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Process Selected Actions
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white rounded-lg overflow-hidden">
          <thead className="bg-gray-100">
            <tr>
              <th className="py-3 px-4 text-left font-medium text-gray-600">Name</th>
              <th className="py-3 px-4 text-left font-medium text-gray-600">Email</th>
              <th className="py-3 px-4 text-left font-medium text-gray-600">Tags</th>
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
                  {candidate.tags ? (
                    candidate.tags.split(';').map((tag, index) => (
                      <span 
                        key={index} 
                        className="inline-block bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded mr-1 mb-1"
                      >
                        {tag.trim()}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-500">No tags</span>
                  )}
                </td>
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