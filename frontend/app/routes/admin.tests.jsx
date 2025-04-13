//app/routes/admin.tests.jsx
import { useState, useEffect } from "react";
import { useLoaderData, Form, useSubmit, useNavigation } from "@remix-run/react";
import { loader } from "../loaders/testsLoader.jsx";
import { action } from "../actions/testsAction.jsx";

// Re-export the loader and action so Remix can pick them up
export { loader, action };

export default function TestsAdmin() {
  const initialData = useLoaderData();
  const [tests, setTests] = useState(initialData.tests || []);
  const [instances, setInstances] = useState(initialData.instances || []);
  const [showNewTestForm, setShowNewTestForm] = useState(false);
  const [showManageCandidatesModal, setShowManageCandidatesModal] = useState(false);
  const [currentTestId, setCurrentTestId] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [currentReport, setCurrentReport] = useState(null);
  
  // Separate state for candidates in different contexts
  const [newTestSelectedCandidates, setNewTestSelectedCandidates] = useState([]);
  const [manageCandidatesSelection, setManageCandidatesSelection] = useState([]);
  
  const [candidates, setCandidates] = useState([]);
  const [testCandidates, setTestCandidates] = useState({ assigned: [], available: [] });
  const submit = useSubmit();
  const navigation = useNavigation();
  
  // Function to fetch instances
  const fetchInstances = async () => {
    try {
      const response = await fetch('http://127.0.0.1:3000/instances/');
      if (response.ok) {
        const instanceData = await response.json();
        console.log('Fetched instances:', instanceData);
        setInstances(instanceData);
      } else {
        console.error('Failed to fetch instances');
      }
    } catch (error) {
      console.error('Error fetching instances:', error);
    }
  };
  
  // Close modals when navigation state changes
  useEffect(() => {
    // Only check for idle state and POST method
    if (navigation.state === "idle" && navigation.formMethod === "POST") {
      console.log("Navigation state changed, checking if we should close modals");
      setShowNewTestForm(false);
      setNewTestSelectedCandidates([]);
      
      // Show success message if a new test was created (could check for specific action if needed)
      if (navigation.formAction === "/admin/tests") {
        // Display a success message
        setTimeout(() => {
          alert("Test created successfully! Use 'Try Test' to test it or 'Manage Candidates' to send it to candidates.");
          
          // Refresh the tests list
          fetchTests();
        }, 500);
      }
    }
  }, [navigation.state, navigation.formMethod]);
  
  // Fetch candidates when opening the new test form
  const handleCreateTestClick = async () => {
    try {
      const response = await fetch('http://127.0.0.1:3000/candidates/');
      if (response.ok) {
        const candidateData = await response.json();
        setCandidates(candidateData);
      } else {
        console.error('Failed to fetch candidates');
      }
    } catch (error) {
      console.error('Error fetching candidates:', error);
    }
    
    setShowNewTestForm(true);
  };

  // Handle Try Test button click
  const handleTryTest = async (testId, testName) => {
    try {
      const response = await fetch(`http://127.0.0.1:3000/tests/${testId}/try/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          adminUser: { name: 'Admin' }
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Open the instance in a new tab
        if (data.accessUrl) {
          setTimeout(() => {
            window.open(data.accessUrl, '_blank');
          }, 1000);
          
          // Refresh both tests and instances list after a short delay
          setTimeout(() => {
            fetchTests();
            fetchInstances();
          }, 2000);
        } else {
          alert(`Instance created but no URL was returned. Port: ${data.instance?.port}`);
        }
      } else {
        const error = await response.text();
        alert(`Failed to create test instance: ${error}`);
      }
    } catch (error) {
      alert(`Error creating test instance: ${error.message}`);
    }
  };

  // Handle deleting an instance
  const handleDeleteInstance = async (instanceId) => {
    if (!confirm("Are you sure you want to delete this instance?")) {
      return;
    }
    
    try {
      console.log(`Deleting instance with ID: ${instanceId}`);
      const response = await fetch(`http://127.0.0.1:3000/instances/${instanceId}/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        console.log('Instance deleted successfully, updating UI');
        // Remove the instance from the UI immediately - check for both 'id' and 'Id' fields
        setInstances(prevInstances => 
          prevInstances.filter(instance => 
            (instance.id !== instanceId) && (instance.Id !== instanceId)
          )
        );
        alert('Instance deleted successfully');
      } else {
        const error = await response.text();
        alert(`Failed to delete instance: ${error}`);
      }
    } catch (error) {
      alert(`Error deleting instance: ${error.message}`);
    }
  };

  // Open the manage candidates modal
  const handleManageCandidates = async (testId) => {
    setCurrentTestId(testId);
    // Clear any previously selected candidates
    setManageCandidatesSelection([]);
    
    try {
      const response = await fetch(`http://127.0.0.1:3000/tests/${testId}/candidates/`);
      if (response.ok) {
        const data = await response.json();
        setTestCandidates(data);
        setShowManageCandidatesModal(true);
      } else {
        alert('Failed to fetch candidates for this test');
      }
    } catch (error) {
      alert(`Error fetching candidates: ${error.message}`);
    }
  };

  // Close the manage candidates modal and reset state
  const handleCloseManageCandidates = () => {
    setShowManageCandidatesModal(false);
    setManageCandidatesSelection([]);
    setCurrentTestId(null);
  };

  // Send test to selected candidates
  const handleSendToSelected = async () => {
    if (manageCandidatesSelection.length === 0) {
      alert('Please select at least one candidate');
      return;
    }
    
    try {
      const response = await fetch(`http://127.0.0.1:3000/tests/${currentTestId}/send/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          candidateIds: manageCandidatesSelection
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        alert(`Test sent to ${result.candidates.length} candidates`);
        handleCloseManageCandidates();
        
        // Refresh the lists
        fetchTests();
        fetchInstances();
      } else {
        const error = await response.text();
        alert(`Failed to send test: ${error}`);
      }
    } catch (error) {
      alert(`Error sending test: ${error.message}`);
    }
  };

  // Handle checkboxes for selecting candidates in the new test form
  const toggleNewTestCandidateSelection = (candidateId) => {
    setNewTestSelectedCandidates(prev => 
      prev.includes(candidateId)
        ? prev.filter(id => id !== candidateId)
        : [...prev, candidateId]
    );
  };
  
  // Handle checkboxes for selecting candidates in the manage candidates modal
  const toggleManageCandidateSelection = (candidateId) => {
    setManageCandidatesSelection(prev => 
      prev.includes(candidateId)
        ? prev.filter(id => id !== candidateId)
        : [...prev, candidateId]
    );
  };

  // Handle View Report button click
  const handleViewReport = async (instanceId) => {
    try {
      console.log(`Fetching report for instance ID: ${instanceId}`);
      const response = await fetch(`http://127.0.0.1:3000/reports/${instanceId}`);
      if (response.ok) {
        const data = await response.json();
        setCurrentReport(data);
        setShowReportModal(true);
      } else {
        const error = await response.text();
        alert(`Failed to fetch report: ${error}`);
      }
    } catch (error) {
      alert(`Error fetching report: ${error.message}`);
    }
  };

  // Close the report modal
  const handleCloseReport = () => {
    setShowReportModal(false);
    setCurrentReport(null);
  };

  // Function to fetch tests
  const fetchTests = async () => {
    try {
      const response = await fetch('http://127.0.0.1:3000/tests/');
      if (response.ok) {
        const testsData = await response.json();
        console.log('Fetched tests:', testsData);
        setTests(testsData);
      } else {
        console.error('Failed to fetch tests');
      }
    } catch (error) {
      console.error('Error fetching tests:', error);
    }
  };
  
  // Add polling for tests and instances
  useEffect(() => {
    // Initial fetch
    fetchTests();
    fetchInstances();
    
    // Set up polling (every 10 seconds to reduce server load)
    const testsInterval = setInterval(fetchTests, 10000);
    const instancesInterval = setInterval(fetchInstances, 10000);
    
    // Clean up intervals when component unmounts
    return () => {
      clearInterval(testsInterval);
      clearInterval(instancesInterval);
    };
  }, []);

  // Handle test deletion
  const handleDeleteTest = async (testId, testName) => {
    if (!confirm(`Are you sure you want to delete the test: ${testName}? This will also delete all associated instances.`)) {
      return;
    }
    
    try {
      console.log(`Deleting test with ID: ${testId}`);
      const response = await fetch(`http://127.0.0.1:3000/tests/${testId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        console.log('Test deleted successfully, updating UI');
        // Remove the test from the UI immediately
        setTests(prevTests => prevTests.filter(test => test.id !== testId));
        // Also fetch instances again as the test deletion might have deleted some instances
        setTimeout(fetchInstances, 500);
        alert('Test deleted successfully');
      } else {
        const errorData = await response.json();
        alert(`Failed to delete test: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert(`Error deleting test: ${error.message}`);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold">Tests</h2>
        <button
          onClick={handleCreateTestClick}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md"
        >
          Create New Test
        </button>
      </div>

      {/* Tests Table */}
      <div className="overflow-x-auto mb-8">
        <table className="min-w-full bg-white rounded-lg overflow-hidden">
          <thead className="bg-gray-100">
            <tr>
              <th className="py-3 px-4 text-left font-medium text-gray-600">Test Name</th>
              <th className="py-3 px-4 text-left font-medium text-gray-600">Created</th>
              <th className="py-3 px-4 text-left font-medium text-gray-600">Candidates Assigned</th>
              <th className="py-3 px-4 text-left font-medium text-gray-600">Completion Rate</th>
              <th className="py-3 px-4 text-left font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {tests && tests.length > 0 ? (
              tests.map((test) => (
                <tr key={test.id}>
                  <td className="py-3 px-4 font-medium">{test.name}</td>
                  <td className="py-3 px-4">{new Date(test.created_at).toLocaleString()}</td>
                  <td className="py-3 px-4">{test.candidates_assigned}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center">
                      <div className="w-full bg-gray-200 rounded-full h-2.5 mr-2">
                        <div 
                          className="bg-blue-600 h-2.5 rounded-full" 
                          style={{ width: `${test.candidates_assigned > 0 
                            ? Math.round((test.candidates_completed / test.candidates_assigned) * 100) 
                            : 0}%` }}
                        ></div>
                      </div>
                      <span>
                        {test.candidates_assigned > 0 
                          ? Math.round((test.candidates_completed / test.candidates_assigned) * 100) 
                          : 0}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <button 
                      className="text-blue-600 hover:text-blue-800 mr-3"
                      onClick={() => alert(`View ${test.name} details`)}
                    >
                      View
                    </button>
                    <button 
                      className="text-indigo-600 hover:text-indigo-800 mr-3"
                      onClick={() => handleManageCandidates(test.id)}
                    >
                      Manage Candidates
                    </button>
                    <button 
                      className="text-green-600 hover:text-green-800 mr-3"
                      onClick={() => handleTryTest(test.id, test.name)}
                    >
                      Try Test
                    </button>
                    <button 
                      className="text-red-500 hover:text-red-700"
                      onClick={() => handleDeleteTest(test.id, test.name)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="py-3 px-4 text-center text-gray-500">
                  No tests created yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* New Test Form Modal */}
      {showNewTestForm && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-4xl w-full max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Create New Test</h3>
              <button 
                onClick={() => setShowNewTestForm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                &times;
              </button>
            </div>

            <Form 
              method="post" 
              className="space-y-6"
              onSubmit={(event) => {
                // Form will be submitted normally via Remix
                // Add a slight delay before closing the modal to ensure the form is submitted
                setTimeout(() => {
                  setShowNewTestForm(false);
                  setNewTestSelectedCandidates([]);
                  
                  // Refresh the tests list after submission
                  setTimeout(fetchTests, 1000);
                }, 300);
              }}
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Test Name
                </label>
                <input 
                  type="text" 
                  name="instanceName" 
                  required 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GitHub Repo URL
                </label>
                <input 
                  type="text" 
                  name="githubRepo" 
                  placeholder="https://github.com/owner/repo.git" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GitHub Token (if needed)
                </label>
                <input 
                  type="text" 
                  name="githubToken" 
                  placeholder="Personal Access Token" 
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="space-y-4">
                <h4 className="font-medium text-lg">Interviewer Prompts</h4>
                
                <div>
                  <label htmlFor="initialPrompt" className="block text-sm font-medium text-gray-700 mb-1">
                    Initial Interview
                  </label>
                  <textarea
                    id="initialPrompt"
                    name="initialPrompt"
                    rows="5"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    defaultValue="You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project, which they have not started yet. Instructions for the project have been provided in the README.md file. Interview the candidate about how they'll go about the project's design, implementation, and testing, in that order. IMPORTANT: Ask only ONE question at a time, and wait for their response before asking the next question. Keep your questions concise and focused."
                  />
                </div>

                <div>
                  <label htmlFor="finalPrompt" className="block text-sm font-medium text-gray-700 mb-1">
                    Post-completion Interview
                  </label>
                  <textarea
                    id="finalPrompt"
                    name="finalPrompt"
                    rows="5"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    defaultValue="You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project, which they have completed. Interview them about their design decisions, implementation, and testing, in that order. IMPORTANT: Ask only ONE question at a time, and wait for their response before asking the next question. Keep your questions concise and focused."
                  />
                </div>

                <div>
                  <label htmlFor="assessmentPrompt" className="block text-sm font-medium text-gray-700 mb-1">
                    Code & Interview Assessment Criteria
                  </label>
                  <textarea
                    id="assessmentPrompt"
                    name="assessmentPrompt"
                    rows="5"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    defaultValue="Please review the following code and interview content. Consider:
1. Code quality and adherence to best practices
2. Potential bugs or edge cases
3. Performance optimizations
4. Readability and maintainability
5. Any security concerns
Suggest improvements and explain your reasoning for each suggestion."
                  />
                </div>
              </div>

              <div>
                <h4 className="font-medium text-lg mb-2">Select Candidates to Assign Test (Optional)</h4>
                <p className="text-sm text-gray-500 mb-2">Note: Candidates will be assigned to the test, but instances will not be created automatically. Use the "Manage Candidates" button after creating the test to send it to candidates.</p>
                <div className="border border-gray-300 rounded-md overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Select
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {candidates.map((candidate) => (
                        <tr key={candidate.id}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input 
                              type="checkbox" 
                              checked={newTestSelectedCandidates.includes(candidate.id)}
                              onChange={() => toggleNewTestCandidateSelection(candidate.id)}
                              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            {newTestSelectedCandidates.includes(candidate.id) && (
                              <input 
                                type="hidden" 
                                name="candidateIds" 
                                value={candidate.id}
                              />
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {candidate.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {candidate.email}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end pt-6 space-x-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowNewTestForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  {newTestSelectedCandidates.length > 0 
                    ? `Create & Assign Test to ${newTestSelectedCandidates.length} Candidates` 
                    : "Create Test"}
                </button>
              </div>
            </Form>
          </div>
        </div>
      )}

      {/* Manage Candidates Modal */}
      {showManageCandidatesModal && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-4xl w-full max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Manage Candidates</h3>
              <button 
                onClick={handleCloseManageCandidates}
                className="text-gray-500 hover:text-gray-700"
              >
                &times;
              </button>
            </div>
            
            <div className="mb-6">
              <h4 className="font-medium text-lg mb-2">Assigned Candidates</h4>
              {testCandidates.assigned && testCandidates.assigned.length > 0 ? (
                <div className="border border-gray-300 rounded-md overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {testCandidates.assigned.map((candidate) => (
                        <tr key={candidate.id}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {candidate.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {candidate.email}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {candidate.completed ? 
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">Completed</span> 
                              : 
                              <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs">In Progress</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No candidates assigned yet.</p>
              )}
            </div>
            
            <div>
              <h4 className="font-medium text-lg mb-2">Send Test to Available Candidates</h4>
              {testCandidates.available && testCandidates.available.length > 0 ? (
                <div className="border border-gray-300 rounded-md overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Select
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {testCandidates.available.map((candidate) => (
                        <tr key={candidate.id}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <input 
                              type="checkbox" 
                              checked={manageCandidatesSelection.includes(candidate.id)}
                              onChange={() => toggleManageCandidateSelection(candidate.id)}
                              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {candidate.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {candidate.email}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No available candidates.</p>
              )}
              
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleSendToSelected}
                  disabled={manageCandidatesSelection.length === 0}
                  className={`px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                    manageCandidatesSelection.length === 0 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                  }`}
                >
                  Send Test to {manageCandidatesSelection.length} Candidates
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Test Instances Section */}
      <div className="mt-8">
        <h3 className="text-xl font-semibold mb-4">Active Test Instances</h3>
        {instances.length === 0 ? (
          <p className="text-gray-500">No active test instances.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white rounded-lg overflow-hidden">
              <thead className="bg-gray-100">
                <tr>
                  <th className="py-3 px-4 text-left font-medium text-gray-600">Instance Name</th>
                  <th className="py-3 px-4 text-left font-medium text-gray-600">Port</th>
                  <th className="py-3 px-4 text-left font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {instances.map((instance) => {
                  // Get the instance ID consistently (handle both lowercase and uppercase)
                  const instanceId = instance.id || instance.Id;
                  
                  return (
                    <tr key={instanceId}>
                      <td className="py-3 px-4 font-medium">{instance.Names.join(", ")}</td>
                      <td className="py-3 px-4">{instance.Ports.map((p) => p.PublicPort).join(", ")}</td>
                      <td className="py-3 px-4">
                        <button 
                          className="text-blue-600 hover:text-blue-800 mr-3"
                          onClick={() => window.open(`http://localhost:${instance.Ports[0]?.PublicPort}`, '_blank')}
                        >
                          Open
                        </button>
                        <button 
                          className="text-purple-600 hover:text-purple-800 mr-3"
                          onClick={() => handleViewReport(instanceId)}
                        >
                          View Report
                        </button>
                        <button 
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleDeleteInstance(instanceId)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-4xl w-full max-h-screen overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-semibold">Test Report</h3>
              <button 
                onClick={handleCloseReport}
                className="text-gray-500 hover:text-gray-700"
              >
                &times;
              </button>
            </div>
            
            {currentReport && currentReport.message ? (
              <p className="text-gray-500">{currentReport.message}</p>
            ) : (
              <div>
                <div className="mb-4">
                  <p className="text-sm text-gray-500">
                    Created at: {currentReport && new Date(currentReport.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <pre className="whitespace-pre-wrap font-sans">
                    {currentReport && currentReport.content}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 
