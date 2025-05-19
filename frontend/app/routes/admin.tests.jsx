//app/routes/admin.tests.jsx
import { useState, useEffect } from "react";
import { useLoaderData, Form, useSubmit, useNavigation } from "@remix-run/react";
import { loader } from "../loaders/testsLoader.jsx";
import { action } from "../actions/testsAction.jsx";
import { getApiEndpoint } from "../utils/api";

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
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [projectTimerEnabled, setProjectTimerEnabled] = useState(true);
  
  // State for optional field toggles
  const [targetGithubRepoEnabled, setTargetGithubRepoEnabled] = useState(true);
  const [targetGithubTokenEnabled, setTargetGithubTokenEnabled] = useState(true);
  const [initialPromptEnabled, setInitialPromptEnabled] = useState(true);
  const [finalPromptEnabled, setFinalPromptEnabled] = useState(true);
  const [assessmentType, setAssessmentType] = useState('qualitative');
  const [qualitativeCriteria, setQualitativeCriteria] = useState(['']);
  const [quantitativeCriteria, setQuantitativeCriteria] = useState([['', '']]);
  
  // Add CSS for toggle switch
  useEffect(() => {
    // Add CSS for toggle switch
    const style = document.createElement('style');
    style.innerHTML = `
      .toggle-checkbox:checked {
        right: 0;
        border-color: #3B82F6;
      }
      .toggle-checkbox:checked + .toggle-label {
        background-color: #3B82F6;
      }
      .toggle-label {
        transition: background-color 0.2s ease;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  
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
      const response = await fetch(getApiEndpoint('instances/'));
      const data = await response.json();
      setInstances(data);
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
      const response = await fetch(getApiEndpoint('candidates/'));
      const data = await response.json();
      setCandidates(data);
    } catch (error) {
      console.error('Error fetching candidates:', error);
    }
    
    setShowNewTestForm(true);
  };

  // Handle Try Test button click
  const handleTryTest = async (testId, testName) => {
    try {
      const response = await fetch(getApiEndpoint(`tests/${testId}/try/`), {
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
      const response = await fetch(getApiEndpoint(`instances/${instanceId}/stop`), {
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
      const response = await fetch(getApiEndpoint(`tests/${testId}/candidates/`));
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
      const response = await fetch(getApiEndpoint(`tests/${currentTestId}/send/`), {
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
      const response = await fetch(getApiEndpoint(`reports/${instanceId}`));
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
      const response = await fetch(getApiEndpoint('tests/'));
      const testsData = await response.json();
      console.log('Fetched tests:', testsData);
      setTests(testsData);
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
      const response = await fetch(getApiEndpoint(`tests/${testId}`), {
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

  // Handle timer toggle change
  const handleTimerToggleChange = (e) => {
    setTimerEnabled(e.target.checked);
  };

  // Handle project timer toggle change
  const handleProjectTimerToggleChange = (e) => {
    setProjectTimerEnabled(e.target.checked);
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
              tests.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((test) => (
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
                event.preventDefault(); // Prevent default browser submission
                // Get the form data to extract timer configuration
                const formData = new FormData(event.target);
                const enableTimer = formData.get('enableTimer') === 'on';
                const timerDuration = parseInt(formData.get('timerDuration'), 10) || 10;
                
                // Get project timer configuration
                const enableProjectTimer = formData.get('enableProjectTimer') === 'on';
                const projectTimerDuration = parseInt(formData.get('projectTimerDuration'), 10) || 60;
                
                // Create the timer configuration JSON
                const timerConfig = {
                  enableTimer: enableTimer,
                  duration: timerDuration,
                  enableProjectTimer: enableProjectTimer,
                  projectDuration: projectTimerDuration
                };
                
                // Create a new FormData object for submission
                const finalFormData = new FormData();

                // Always include test name and timer config
                finalFormData.append('instanceName', formData.get('instanceName'));
                finalFormData.append('timerConfigJson', JSON.stringify(timerConfig));
                finalFormData.append('enableTimer', enableTimer ? 'on' : 'off');
                finalFormData.append('timerDuration', timerDuration.toString());
                finalFormData.append('enableProjectTimer', enableProjectTimer ? 'on' : 'off');
                finalFormData.append('projectTimerDuration', projectTimerDuration.toString());

                // Add required GitHub fields (Get values directly from formData)
                finalFormData.append('githubRepo', formData.get('githubRepo') || '');
                finalFormData.append('githubToken', formData.get('githubToken') || '');

                // Add optional fields based on toggles
                if (targetGithubRepoEnabled) {
                  finalFormData.append('targetGithubRepo', formData.get('targetGithubRepo'));
                }
                if (targetGithubTokenEnabled) {
                  finalFormData.append('targetGithubToken', formData.get('targetGithubToken'));
                }
                if (initialPromptEnabled) {
                  finalFormData.append('initialPrompt', formData.get('initialPrompt'));
                }
                if (finalPromptEnabled) {
                  finalFormData.append('finalPrompt', formData.get('finalPrompt'));
                }

                // Add assessment criteria based on type
                if (assessmentType === 'qualitative' || assessmentType === 'both') {
                  // Filter out empty strings from qualitativeCriteria before stringifying
                  const activeQualitativeCriteria = qualitativeCriteria.filter(criterion => criterion.trim() !== '');
                  if (activeQualitativeCriteria.length > 0) {
                    finalFormData.append('qualitativeAssessmentPrompt', JSON.stringify(activeQualitativeCriteria));
                  } else {
                    finalFormData.append('qualitativeAssessmentPrompt', JSON.stringify([])); // Send empty array if all are empty
                  }
                } else {
                  finalFormData.append('qualitativeAssessmentPrompt', JSON.stringify([])); // Send empty if not selected
                }

                if (assessmentType === 'quantitative' || assessmentType === 'both') {
                  // Filter out incomplete quantitative criteria before stringifying
                  const activeQuantitativeCriteria = quantitativeCriteria.filter(row => {
                    // A row is active if its description (row[0]) is not empty 
                    // AND it has at least one non-empty score description (row[1] onwards)
                    const descriptionNotEmpty = row[0] && row[0].trim() !== '';
                    const scoreDescriptions = row.slice(1).filter(desc => desc && desc.trim() !== '');
                    return descriptionNotEmpty && scoreDescriptions.length > 0;
                  }).map(row => {
                    // For active rows, also filter out empty score descriptions within that row
                    const description = row[0];
                    const filteredScores = row.slice(1).filter(desc => desc && desc.trim() !== '');
                    return [description, ...filteredScores];
                  });

                  if (activeQuantitativeCriteria.length > 0) {
                    finalFormData.append('quantitativeAssessmentPrompt', JSON.stringify(activeQuantitativeCriteria));
                  }
                  else {
                    finalFormData.append('quantitativeAssessmentPrompt', JSON.stringify([])); // Send empty array if all are empty/incomplete
                  }
                } else {
                  finalFormData.append('quantitativeAssessmentPrompt', JSON.stringify([])); // Send empty if not selected
                }

                // Add selected candidate IDs
                newTestSelectedCandidates.forEach(id => {
                  finalFormData.append('candidateIds', id.toString());
                });

                // Use useSubmit hook to submit the processed data
                submit(finalFormData, { method: 'post' });

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

              <div className="space-y-4">
                <h4 className="font-medium text-lg">Initial Timer Configuration</h4>
                <div className="flex items-center justify-between">
                  <label htmlFor="enableTimer" className="text-sm font-medium text-gray-700">
                    Initial Waiting Timer
                  </label>
                  <div className="flex items-center space-x-2">
                    <span className={`text-sm ${timerEnabled ? 'text-blue-600' : 'text-gray-500'}`}>
                      {timerEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <div className="relative inline-block w-10 align-middle select-none">
                      <input 
                        type="checkbox" 
                        name="enableTimer" 
                        id="enableTimer" 
                        checked={timerEnabled}
                        onChange={handleTimerToggleChange}
                        className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                      />
                      <label 
                        htmlFor="enableTimer" 
                        className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"
                      ></label>
                    </div>
                  </div>
                </div>
                <div>
                  <label htmlFor="timerDuration" className="block text-sm font-medium text-gray-700 mb-1">
                    Timer Duration (minutes)
                  </label>
                  <input 
                    type="number" 
                    id="timerDuration" 
                    name="timerDuration" 
                    min="1"
                    max="120"
                    defaultValue="10"
                    disabled={!timerEnabled}
                    className={`w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${!timerEnabled ? 'bg-gray-100 text-gray-500' : ''}`}
                  />
                </div>

                <h4 className="font-medium text-lg mt-6">Project Work Timer Configuration</h4>
                <div className="flex items-center justify-between">
                  <label htmlFor="enableProjectTimer" className="text-sm font-medium text-gray-700">
                    Project Work Timer
                  </label>
                  <div className="flex items-center space-x-2">
                    <span className={`text-sm ${projectTimerEnabled ? 'text-blue-600' : 'text-gray-500'}`}>
                      {projectTimerEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <div className="relative inline-block w-10 align-middle select-none">
                      <input 
                        type="checkbox" 
                        name="enableProjectTimer" 
                        id="enableProjectTimer" 
                        checked={projectTimerEnabled}
                        onChange={handleProjectTimerToggleChange}
                        className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                      />
                      <label 
                        htmlFor="enableProjectTimer" 
                        className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"
                      ></label>
                    </div>
                  </div>
                </div>
                <div>
                  <label htmlFor="projectTimerDuration" className="block text-sm font-medium text-gray-700 mb-1">
                    Project Work Duration (minutes)
                  </label>
                  <input 
                    type="number" 
                    id="projectTimerDuration" 
                    name="projectTimerDuration" 
                    min="1"
                    max="240"
                    defaultValue="60"
                    disabled={!projectTimerEnabled}
                    className={`w-32 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${!projectTimerEnabled ? 'bg-gray-100 text-gray-500' : ''}`}
                  />
                </div>
                {/* Hidden field for timer configuration */}
                <input type="hidden" name="timerConfigJson" id="timerConfigJson" />
              </div>

              {/* GitHub Repo URL (Required) */}
              <div>
                 <label htmlFor="githubRepo" className="block text-sm font-medium text-gray-700 mb-1">
                   GitHub Repo URL
                 </label>
                 <input 
                   type="text" 
                   id="githubRepo"
                   name="githubRepo" 
                   required
                   placeholder="https://github.com/owner/repo.git" 
                   className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                 />
              </div>

              {/* GitHub Token (Required if repo is private) */}
              <div>
                 <label htmlFor="githubToken" className="block text-sm font-medium text-gray-700 mb-1">
                   GitHub Token <span className="text-red-500">(Required if target repo is private)</span>
                 </label>
                 <input 
                   type="text" 
                   id="githubToken"
                   name="githubToken" 
                   placeholder="Personal Access Token" 
                   className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                 />
              </div>

              {/* Target GitHub Repo URL */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">
                    Target GitHub Repo URL (for Upload)
                  </label>
                   <div className="flex items-center space-x-2">
                    <span className={`text-sm ${targetGithubRepoEnabled ? 'text-blue-600' : 'text-gray-500'}`}>
                      {targetGithubRepoEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <div className="relative inline-block w-10 align-middle select-none">
                      <input 
                        type="checkbox" 
                        id="targetGithubRepoEnabled" 
                        checked={targetGithubRepoEnabled}
                        onChange={(e) => setTargetGithubRepoEnabled(e.target.checked)}
                        className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                      />
                      <label 
                        htmlFor="targetGithubRepoEnabled" 
                        className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"
                      ></label>
                    </div>
                  </div>
                </div>
                <input 
                  type="text" 
                  name="targetGithubRepo" 
                  placeholder="https://github.com/owner/target-repo.git" 
                  disabled={!targetGithubRepoEnabled}
                   className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${!targetGithubRepoEnabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                />
                <p className="text-xs text-gray-500 mt-1">The completed project files will be uploaded here.</p>
              </div>

              {/* Target GitHub Token */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                   <label className="block text-sm font-medium text-gray-700">
                    Target GitHub Token (for Upload) <span className="text-red-500">(Token with code write access always required!)</span>
                  </label>
                   <div className="flex items-center space-x-2">
                    <span className={`text-sm ${targetGithubTokenEnabled ? 'text-blue-600' : 'text-gray-500'}`}>
                      {targetGithubTokenEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <div className="relative inline-block w-10 align-middle select-none">
                      <input 
                        type="checkbox" 
                        id="targetGithubTokenEnabled" 
                        checked={targetGithubTokenEnabled}
                        onChange={(e) => setTargetGithubTokenEnabled(e.target.checked)}
                        className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                      />
                      <label 
                        htmlFor="targetGithubTokenEnabled" 
                        className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"
                      ></label>
                    </div>
                  </div>
                </div>
                <input 
                  type="text" 
                  name="targetGithubToken" 
                  placeholder="Personal Access Token with repo write access" 
                  disabled={!targetGithubTokenEnabled}
                   className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${!targetGithubTokenEnabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                />
              </div>

              <div className="space-y-4">
                <h4 className="font-medium text-lg mb-2">Interviewer Prompts</h4>
                
                {/* Initial Interview Prompt */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="initialPrompt" className="block text-sm font-medium text-gray-700">
                      Initial Interview
                    </label>
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm ${initialPromptEnabled ? 'text-blue-600' : 'text-gray-500'}`}>
                        {initialPromptEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <div className="relative inline-block w-10 align-middle select-none">
                        <input 
                          type="checkbox" 
                          id="initialPromptEnabled" 
                          checked={initialPromptEnabled}
                          onChange={(e) => setInitialPromptEnabled(e.target.checked)}
                          className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                        />
                        <label 
                          htmlFor="initialPromptEnabled" 
                          className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"
                        ></label>
                      </div>
                    </div>
                  </div>
                  <textarea
                    id="initialPrompt"
                    name="initialPrompt"
                    rows="5"
                    disabled={!initialPromptEnabled}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${!initialPromptEnabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                    defaultValue="You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project, which they have not started yet. Instructions for the project have been provided in the README.md file. Interview the candidate about how they'll go about the project's design, implementation, and testing, in that order. IMPORTANT: Ask only ONE question at a time, and wait for their response before asking the next question. Keep your questions concise and focused."
                  />
                </div>

                {/* Final Interview Prompt */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="finalPrompt" className="block text-sm font-medium text-gray-700">
                      Post-completion Interview
                    </label>
                     <div className="flex items-center space-x-2">
                      <span className={`text-sm ${finalPromptEnabled ? 'text-blue-600' : 'text-gray-500'}`}>
                        {finalPromptEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <div className="relative inline-block w-10 align-middle select-none">
                        <input 
                          type="checkbox" 
                          id="finalPromptEnabled" 
                          checked={finalPromptEnabled}
                          onChange={(e) => setFinalPromptEnabled(e.target.checked)}
                          className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                        />
                        <label 
                          htmlFor="finalPromptEnabled" 
                          className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"
                        ></label>
                      </div>
                    </div>
                  </div>
                  <textarea
                    id="finalPrompt"
                    name="finalPrompt"
                    rows="5"
                    disabled={!finalPromptEnabled}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${!finalPromptEnabled ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                    defaultValue="You are a technical interviewer assessing a software engineering candidate. They have been provided with a coding project, which they have completed. Interview them about their design decisions, implementation, and testing, in that order. IMPORTANT: Ask only ONE question at a time, and wait for their response before asking the next question. Keep your questions concise and focused."
                  />
                </div>
              </div>

              {/* New Assessment Criteria Section */}
              <div className="space-y-4">
                <h4 className="font-medium text-lg mb-2">Assessment Criteria</h4>
                
                {/* Toggle for Assessment Type */}
                <div className="flex items-center space-x-4 mb-4">
                  <label className="block text-sm font-medium text-gray-700">Criteria Type:</label>
                  <div className="flex items-center">
                    <input 
                      type="radio" 
                      id="qualitative" 
                      name="assessmentType" 
                      value="qualitative" 
                      checked={assessmentType === 'qualitative'}
                      onChange={() => setAssessmentType('qualitative')} 
                      className="mr-1"
                    />
                    <label htmlFor="qualitative" className="text-sm">Qualitative</label>
                  </div>
                  <div className="flex items-center">
                    <input 
                      type="radio" 
                      id="quantitative" 
                      name="assessmentType" 
                      value="quantitative" 
                      checked={assessmentType === 'quantitative'}
                      onChange={() => setAssessmentType('quantitative')} 
                      className="mr-1"
                    />
                    <label htmlFor="quantitative" className="text-sm">Quantitative</label>
                  </div>
                  <div className="flex items-center">
                    <input 
                      type="radio" 
                      id="both" 
                      name="assessmentType" 
                      value="both" 
                      checked={assessmentType === 'both'}
                      onChange={() => setAssessmentType('both')} 
                      className="mr-1"
                    />
                    <label htmlFor="both" className="text-sm">Both</label>
                  </div>
                </div>

                {/* Qualitative Criteria UI */}
                {(assessmentType === 'qualitative' || assessmentType === 'both') && (
                  <div className="space-y-3 p-4 border border-gray-200 rounded-md">
                    <h5 className="font-medium text-md mb-2">Qualitative Criteria</h5>
                    {qualitativeCriteria.map((criterion, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={criterion}
                          onChange={(e) => {
                            const newCriteria = [...qualitativeCriteria];
                            newCriteria[index] = e.target.value;
                            setQualitativeCriteria(newCriteria);
                          }}
                          placeholder={`Criterion ${index + 1}`}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button 
                          type="button" 
                          onClick={() => {
                            const newCriteria = qualitativeCriteria.filter((_, i) => i !== index);
                            setQualitativeCriteria(newCriteria.length > 0 ? newCriteria : ['']);
                          }}
                          className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm"
                        >
                          -
                        </button>
                      </div>
                    ))}
                    <button 
                      type="button" 
                      onClick={() => setQualitativeCriteria([...qualitativeCriteria, ''])}
                      className="px-3 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 text-sm mt-2"
                    >
                      + Add Criterion
                    </button>
                  </div>
                )}

                {/* Quantitative Criteria (Rubric) UI */}
                {(assessmentType === 'quantitative' || assessmentType === 'both') && (
                  <div className="space-y-4 p-4 border border-gray-200 rounded-md">
                    <h5 className="font-medium text-md mb-3">Quantitative Criteria (Rubric)</h5>
                    {quantitativeCriteria.map((row, rowIndex) => (
                      <div key={rowIndex} className="space-y-2 p-3 border border-gray-100 rounded-md bg-gray-50">
                        <div className="flex items-center space-x-2 mb-2">
                          <input
                            type="text"
                            value={row[0]} // First element is the rubric item description
                            onChange={(e) => {
                              const newCriteria = JSON.parse(JSON.stringify(quantitativeCriteria));
                              newCriteria[rowIndex][0] = e.target.value;
                              setQuantitativeCriteria(newCriteria);
                            }}
                            placeholder={`Rubric Item ${rowIndex + 1} (e.g., Code Quality)`}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-medium"
                          />
                          <button 
                            type="button" 
                            onClick={() => {
                              const newCriteria = quantitativeCriteria.filter((_, i) => i !== rowIndex);
                              setQuantitativeCriteria(newCriteria.length > 0 ? newCriteria : [['', '']]);
                            }}
                            className="px-3 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm"
                          >
                            Remove Item
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 ml-1">Score Descriptions (Lowest to Highest):</p>
                        {row.slice(1).map((scoreDesc, scoreIndex) => ( // Iterate from the second element for score descriptions
                          <div key={scoreIndex} className="flex items-center space-x-2 pl-4">
                            <input
                              type="text"
                              value={scoreDesc}
                              onChange={(e) => {
                                const newCriteria = JSON.parse(JSON.stringify(quantitativeCriteria));
                                newCriteria[rowIndex][scoreIndex + 1] = e.target.value;
                                setQuantitativeCriteria(newCriteria);
                              }}
                              placeholder={`Score ${scoreIndex + 1} Description`}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                            <button 
                              type="button" 
                              onClick={() => {
                                const newCriteria = JSON.parse(JSON.stringify(quantitativeCriteria));
                                newCriteria[rowIndex].splice(scoreIndex + 1, 1);
                                // Ensure at least one score description input remains if the item itself is not empty
                                if (newCriteria[rowIndex].length < 2 && newCriteria[rowIndex][0] !== '') {
                                   newCriteria[rowIndex].push(''); 
                                }
                                setQuantitativeCriteria(newCriteria);
                              }}
                              className="px-2 py-1 bg-red-400 text-white rounded-md hover:bg-red-500 text-xs"
                            >
                              -
                            </button>
                          </div>
                        ))}
                        <button 
                          type="button" 
                          onClick={() => {
                            const newCriteria = JSON.parse(JSON.stringify(quantitativeCriteria));
                            newCriteria[rowIndex].push('');
                            setQuantitativeCriteria(newCriteria);
                          }}
                          className="px-3 py-1 bg-green-400 text-white rounded-md hover:bg-green-500 text-xs mt-1 ml-4"
                        >
                          + Add Score Point
                        </button>
                      </div>
                    ))}
                    <button 
                      type="button" 
                      onClick={() => setQuantitativeCriteria([...quantitativeCriteria, ['', '']])} // New row with item description and one score point
                      className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm mt-2"
                    >
                      + Add Rubric Item
                    </button>
                  </div>
                )}
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
