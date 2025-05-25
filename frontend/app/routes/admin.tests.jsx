//app/routes/admin.tests.jsx
import { useState, useEffect, useMemo } from "react";
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
  
  // Separate state for candidates in different contexts
  const [newTestSelectedCandidates, setNewTestSelectedCandidates] = useState([]);
  const [manageCandidatesSelection, setManageCandidatesSelection] = useState([]);
  
  const [candidates, setCandidates] = useState([]);
  const [testCandidates, setTestCandidates] = useState({ assigned: [], available: [] });
  const submit = useSubmit();
  const navigation = useNavigation();
  
  // Add new state for selected assigned candidates to remove
  const [selectedAssignedCandidates, setSelectedAssignedCandidates] = useState([]);
  
  // Remove time-related state
  const [editingDeadline, setEditingDeadline] = useState(null);
  const [assignedDeadlineDate, setAssignedDeadlineDate] = useState({});
  const [availableDeadlineDate, setAvailableDeadlineDate] = useState('');
  const [error, setError] = useState(null);
  
  // Add new state for tag filtering and selection
  const [tagFilter, setTagFilter] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectAllShown, setSelectAllShown] = useState(false);

  // Add state for email sending
  const [isSendingEmails, setIsSendingEmails] = useState(false);
  const [emailResults, setEmailResults] = useState(null);

  // Add function to get unique tags from candidates
  const getAllTags = useMemo(() => {
    const tags = new Set();
    candidates.forEach(candidate => {
      if (candidate.tags) {
        candidate.tags.split(';').forEach(tag => {
          if (tag.trim()) tags.add(tag.trim());
        });
      }
    });
    return Array.from(tags).sort();
  }, [candidates]);

  // Add function to filter candidates by tags
  const filterCandidatesByTags = (candidates) => {
    if (!selectedTags.length) return candidates;
    return candidates.filter(candidate => {
      if (!candidate.tags) return false;
      const candidateTags = candidate.tags.split(';').map(tag => tag.trim());
      return selectedTags.some(tag => candidateTags.includes(tag));
    });
  };

  // Add function to handle tag selection
  const handleTagSelection = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  // Add function to handle select all shown
  const handleSelectAllShown = (candidates) => {
    if (selectAllShown) {
      // Deselect all shown candidates
      setNewTestSelectedCandidates(prev => 
        prev.filter(id => !candidates.some(c => c.id === id))
      );
      setManageCandidatesSelection(prev => 
        prev.filter(id => !candidates.some(c => c.id === id))
      );
    } else {
      // Select all shown candidates
      const newIds = candidates.map(c => c.id);
      setNewTestSelectedCandidates(prev => [...new Set([...prev, ...newIds])]);
      setManageCandidatesSelection(prev => [...new Set([...prev, ...newIds])]);
    }
    setSelectAllShown(!selectAllShown);
  };

  // Helper function to get midnight EST for a given date
  const getMidnightEST = (dateStr) => {
    const date = new Date(dateStr);
    // Create date string for midnight EST (UTC-5)
    const estMidnight = new Date(date.getTime() + (5 * 60 * 60 * 1000));
    estMidnight.setUTCHours(0, 0, 0, 0);
    return estMidnight.toISOString();
  };

  // Helper function to get min date
  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

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
    setEditingDeadline(null);
    setAssignedDeadlineDate({});
    setAvailableDeadlineDate('');
    setEmailResults(null);
  };

  // Update handleUpdateDeadline to use midnight EST
  const handleUpdateDeadline = async (candidateId) => {
    try {
      const date = assignedDeadlineDate[candidateId];
      
      if (!date) {
        setError('Please select a date for the deadline');
        return;
      }
    
      const deadline = getMidnightEST(date);
      
      if (new Date(deadline) < new Date()) {
        setError('Deadline must be in the future');
        return;
      }

      const endpoint = getApiEndpoint(`tests/${currentTestId}/candidates/${candidateId}/deadline`);
      
      const response = await fetch(
        endpoint,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ deadline }),
        }
      );

      const responseData = await response.json();

      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to update deadline');
      }

      // Refresh the candidates list to ensure we have the latest data
      const candidatesResponse = await fetch(getApiEndpoint(`tests/${currentTestId}/candidates/`));
      if (candidatesResponse.ok) {
        const candidatesData = await candidatesResponse.json();
        setTestCandidates(candidatesData);
      } else {
        // If refresh fails, update the local state as a fallback
        setTestCandidates(prev => ({
          ...prev,
          assigned: prev.assigned.map(c => 
            c.id === candidateId 
              ? { ...c, deadline: responseData.deadline }
              : c
          )
        }));
      }

      // Clear the editing state and reset form values
      setEditingDeadline(null);
      setAssignedDeadlineDate({});
      setError(null);
    } catch (err) {
      console.error('Error updating deadline:', err);
      setError(err.message || 'Failed to update deadline');
    }
  };

  // Update handleSendToSelected to use midnight EST
  const handleSendToSelected = async () => {
    try {
      const selectedAvailable = testCandidates.available.filter(c => manageCandidatesSelection.includes(c.id));
      
      if (selectedAvailable.length === 0) {
        setError('Please select at least one candidate');
        return;
      }

      const date = availableDeadlineDate;
      
      if (!date) {
        setError('Please select a date for the deadline');
        return;
      }

      const deadline = getMidnightEST(date);
      if (new Date(deadline) < new Date()) {
        setError('Deadline must be in the future');
        return;
      }

      // Assign each selected candidate with the deadline
      const assignments = await Promise.all(
        selectedAvailable.map(candidate =>
          fetch(getApiEndpoint(`tests/${currentTestId}/candidates/${candidate.id}`), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ deadline }),
          }).then(async res => {
            if (!res.ok) {
              throw new Error(`Failed to assign test to ${candidate.name}`);
            }
            const result = await res.json();
            return {
              ...candidate,
              deadline,
              test_completed: false
            };
          })
        )
      );

      // Update the testCandidates state with the new assignments
      setTestCandidates(prev => ({
        assigned: [...prev.assigned, ...assignments],
        available: prev.available.filter(c => !manageCandidatesSelection.includes(c.id))
      }));
      
      // Clear the selection and deadline
      setManageCandidatesSelection([]);
      setAvailableDeadlineDate('');
      setError(null);
    } catch (err) {
      console.error('Error assigning candidates:', err);
      setError(err.message || 'Failed to assign candidates');
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

  // Add handler for removing candidates
  const handleRemoveSelected = async () => {
    if (selectedAssignedCandidates.length === 0) {
      alert('Please select at least one candidate to remove');
      return;
    }
    
    if (!confirm(`Are you sure you want to remove ${selectedAssignedCandidates.length} candidate(s) from this test?`)) {
      return;
    }
    
    try {
      const results = await Promise.all(
        selectedAssignedCandidates.map(candidateId =>
          fetch(getApiEndpoint(`tests/${currentTestId}/candidates/${candidateId}`), {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json'
            }
          }).then(res => res.json())
        )
      );
      
      // Check if all removals were successful
      const allSuccessful = results.every(result => result.success);
      
      if (allSuccessful) {
        alert(`Successfully removed ${selectedAssignedCandidates.length} candidate(s) from the test`);
        // Refresh the candidates list
        const response = await fetch(getApiEndpoint(`tests/${currentTestId}/candidates/`));
        if (response.ok) {
          const data = await response.json();
          setTestCandidates(data);
        }
        // Clear selection
        setSelectedAssignedCandidates([]);
        // Refresh tests list to update counts
        fetchTests();
      } else {
        alert('Some candidates could not be removed. Please try again.');
      }
    } catch (error) {
      alert(`Error removing candidates: ${error.message}`);
    }
  };

  // Add handler for selecting assigned candidates to remove
  const toggleAssignedCandidateSelection = (candidateId) => {
    setSelectedAssignedCandidates(prev => 
      prev.includes(candidateId)
        ? prev.filter(id => id !== candidateId)
        : [...prev, candidateId]
    );
  };

  // Add handler for sending email invitations
  const handleSendEmailInvitations = async () => {
    if (selectedAssignedCandidates.length === 0) {
      alert('Please select at least one candidate to send invitations to');
      return;
    }

    setIsSendingEmails(true);
    setEmailResults(null);

    try {
      const response = await fetch(getApiEndpoint('instances/send-invitations'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          testId: currentTestId,
          candidateIds: selectedAssignedCandidates,
          deadline: testCandidates.assigned.find(c => selectedAssignedCandidates.includes(c.id))?.deadline
        })
      });

      const result = await response.json();

      if (response.ok) {
        setEmailResults(result);
        setSelectedAssignedCandidates([]);
        
        // Refresh instances to show newly created instances
        setTimeout(fetchInstances, 1000);
      } else {
        throw new Error(result.error || 'Failed to send invitations');
      }
    } catch (error) {
      alert(`Error sending email invitations: ${error.message}`);
    } finally {
      setIsSendingEmails(false);
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
        <div className="min-w-[1024px]">
          <table className="w-full bg-white rounded-lg overflow-hidden">
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
                            style={{ width: `${test.candidates_completed > 0 
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
                    <button
                      type="button"
                      onClick={() => setTimerEnabled(!timerEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                        timerEnabled ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          timerEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <input 
                      type="hidden" 
                      name="enableTimer" 
                      value={timerEnabled ? 'on' : 'off'}
                    />
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
                    <button
                      type="button"
                      onClick={() => setProjectTimerEnabled(!projectTimerEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                        projectTimerEnabled ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          projectTimerEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <input 
                      type="hidden" 
                      name="enableProjectTimer" 
                      value={projectTimerEnabled ? 'on' : 'off'}
                    />
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
                    <button
                      type="button"
                      onClick={() => setTargetGithubRepoEnabled(!targetGithubRepoEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                        targetGithubRepoEnabled ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          targetGithubRepoEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
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
                    <button
                      type="button"
                      onClick={() => setTargetGithubTokenEnabled(!targetGithubTokenEnabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                        targetGithubTokenEnabled ? 'bg-blue-600' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          targetGithubTokenEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
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
                      <button
                        type="button"
                        onClick={() => setInitialPromptEnabled(!initialPromptEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          initialPromptEnabled ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            initialPromptEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
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
                      <button
                        type="button"
                        onClick={() => setFinalPromptEnabled(!finalPromptEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                          finalPromptEnabled ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            finalPromptEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
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
                <p className="text-sm text-gray-500 mb-2">Note: Candidates will be assigned to the test, but the test will not be sent automatically. Use the "Manage Candidates" button after creating the test to set deadlines and send the test to candidates.</p>
                
                {/* Tag Filter Section */}
                <div className="mb-4">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {getAllTags.map(tag => (
                      <button
                        key={tag}
                        onClick={() => handleTagSelection(tag)}
                        className={`px-2 py-1 rounded text-sm ${
                          selectedTags.includes(tag)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  {selectedTags.length > 0 && (
                    <button
                      onClick={() => setSelectedTags([])}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Clear tag filters
                    </button>
                  )}
                </div>

                <div className="border border-gray-300 rounded-md overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 flex justify-between items-center">
                    <span className="text-sm text-gray-600">
                      {filterCandidatesByTags(candidates).length} candidates shown
                    </span>
                    <button
                      onClick={() => handleSelectAllShown(filterCandidatesByTags(candidates))}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      {selectAllShown ? 'Deselect All Shown' : 'Select All Shown'}
                    </button>
                  </div>
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
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Tags
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filterCandidatesByTags(candidates).map((candidate) => (
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
                          <td className="px-4 py-3 whitespace-nowrap">
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
            <div className="flex flex-col space-y-2">
              <h3 className="text-xl font-semibold">Manage Candidates</h3>
              <p className="text-sm text-gray-500">Assign available candidates under 'Available Candidates', then send email invitations under 'Assigned Candidates'.</p>
            </div>
              <button 
                onClick={handleCloseManageCandidates}
                className="text-gray-500 hover:text-gray-700"
              >
                &times;
              </button>
            </div>
            
            {/* Email Results Display */}
            {emailResults && (
              <div className="mb-6 p-4 rounded-lg bg-blue-50 border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">Email Invitation Results</h4>
                <p className="text-blue-800 mb-2">{emailResults.message}</p>
                {emailResults.results.success.length > 0 && (
                  <div className="mb-2">
                    <p className="text-sm font-medium text-green-700">Successfully sent to:</p>
                    <ul className="text-sm text-green-600 ml-4">
                      {emailResults.results.success.map((result, index) => (
                        <li key={index}>• {result.candidate_name} ({result.candidate_email})</li>
                      ))}
                    </ul>
                  </div>
                )}
                {emailResults.results.errors.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-red-700">Failed to send to:</p>
                    <ul className="text-sm text-red-600 ml-4">
                      {emailResults.results.errors.map((error, index) => (
                        <li key={index}>• Candidate ID {error.candidate_id}: {error.error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <button
                  onClick={() => setEmailResults(null)}
                  className="mt-2 px-3 py-1 text-sm font-medium text-blue-600 bg-transparent border border-transparent rounded-md hover:text-blue-800 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Dismiss
                </button>
              </div>
            )}
            
            {/* Assigned Candidates Section */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium text-lg">Assigned Candidates</h4>
                <div className="flex space-x-2">
                  <button
                    onClick={handleSendEmailInvitations}
                    disabled={isSendingEmails || selectedAssignedCandidates.length === 0}
                    className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm ${
                      isSendingEmails || selectedAssignedCandidates.length === 0
                        ? 'bg-gray-400 text-white cursor-not-allowed' 
                        : 'bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500'
                    }`}
                  >
                    {isSendingEmails ? 'Sending...' : `Send Email Invitations (${selectedAssignedCandidates.length})`}
                  </button>
                  <button
                    onClick={handleRemoveSelected}
                    disabled={isSendingEmails || selectedAssignedCandidates.length === 0}
                    className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm ${
                      isSendingEmails || selectedAssignedCandidates.length === 0
                        ? 'bg-gray-400 text-white cursor-not-allowed'
                        : 'bg-red-600 text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500'
                    }`}
                  >
                    {isSendingEmails ? 'Sending...' : `Remove Selected (${selectedAssignedCandidates.length})`}
                  </button>
                </div>
              </div>
              {testCandidates.assigned && testCandidates.assigned.length > 0 ? (
                <div className="overflow-x-auto">
                  <div className="min-w-[1024px]">
                    <table className="w-full border border-gray-300 rounded-md overflow-hidden">
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
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Deadline
                          </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {testCandidates.assigned.map((candidate) => (
                        <tr key={candidate.id}>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <input 
                                type="checkbox" 
                                checked={selectedAssignedCandidates.includes(candidate.id)}
                                onChange={() => toggleAssignedCandidateSelection(candidate.id)}
                                className="h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                              />
                            </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {candidate.name}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {candidate.email}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`px-2 py-1 rounded text-xs ${
                                candidate.test_completed 
                                  ? "bg-green-100 text-green-800" 
                                  : "bg-yellow-100 text-yellow-800"
                              }`}>
                                {candidate.test_completed ? "Completed" : "Pending"}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {editingDeadline === candidate.id ? (
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="date"
                                    value={assignedDeadlineDate[candidate.id]}
                                    min={getMinDate()}
                                    onChange={(e) => setAssignedDeadlineDate({ ...assignedDeadlineDate, [candidate.id]: e.target.value })}
                                    className={`px-2 py-1 border border-gray-300 rounded text-sm ${
                                      !assignedDeadlineDate[candidate.id] ? 'bg-gray-100' : ''
                                    }`}
                                  />
                                  <button
                                    onClick={() => handleUpdateDeadline(candidate.id)}
                                    className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingDeadline(null);
                                      setAssignedDeadlineDate({});
                                    }}
                                    className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm">
                                    {candidate.deadline 
                                      ? new Date(candidate.deadline).toLocaleDateString('en-US', { 
                                          timeZone: 'America/New_York',
                                          year: 'numeric',
                                          month: 'short',
                                          day: 'numeric'
                                        })
                                      : 'No deadline set'}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setEditingDeadline(candidate.id);
                                      if (candidate.deadline) {
                                        const date = new Date(candidate.deadline);
                                        setAssignedDeadlineDate({ 
                                          ...assignedDeadlineDate, 
                                          [candidate.id]: date.toISOString().split('T')[0] 
                                        });
                                      }
                                    }}
                                    className="inline-flex items-center px-2 py-1 text-sm font-medium text-blue-600 bg-transparent border border-transparent rounded-md hover:text-blue-800 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                                  >
                                    Edit
                                  </button>
                                </div>
                              )}
                            </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No candidates assigned to this test yet.</p>
              )}
            </div>
            
            {/* Available Candidates Section */}
            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Available Candidates</h3>
                <button
                  onClick={handleSendToSelected}
                  disabled={manageCandidatesSelection.length === 0}
                  className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm ${
                    manageCandidatesSelection.length === 0
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                  }`}
                >
                  Assign Test to Selected Candidates ({manageCandidatesSelection.length})
                </button>
              </div>
              {testCandidates.available.length > 0 ? (
                <div className="space-y-4">

                  {/* Deadline Section */}
                  <div className="flex items-center space-x-4 mb-4">
                    <div className="flex-1">
                      <label htmlFor="available-deadline-date" className="block text-sm font-medium text-gray-700">
                        Deadline
                      </label>
                      <p className="text-xs text-gray-500 mt-1">Deadline will be set to midnight EST on the selected date</p>
                      <input
                        type="date"
                        id="available-deadline-date"
                        value={availableDeadlineDate}
                        min={getMinDate()}
                        onChange={(e) => setAvailableDeadlineDate(e.target.value)}
                        className={`mt-1 block rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm ${
                          !availableDeadlineDate ? 'bg-gray-100' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {/* Tag Filter Section */}
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-2 mb-2">
                      {getAllTags.map(tag => (
                        <button
                          key={tag}
                          onClick={() => handleTagSelection(tag)}
                          className={`inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md ${
                            selectedTags.includes(tag)
                              ? 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    {selectedTags.length > 0 && (
                      <button
                        onClick={() => setSelectedTags([])}
                        className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-600 bg-transparent border border-transparent rounded-md hover:text-blue-800 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        Clear tag filters
                      </button>
                    )}
                  </div>


                  <div className="bg-gray-50 px-4 py-2 flex justify-between items-center rounded-t-md">
                    <span className="text-sm text-gray-600">
                      {filterCandidatesByTags(testCandidates.available).length} candidates shown
                    </span>
                    <button
                      onClick={() => handleSelectAllShown(filterCandidatesByTags(testCandidates.available))}
                      className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-600 bg-transparent border border-transparent rounded-md hover:text-blue-800 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      {selectAllShown ? 'Deselect All Shown' : 'Select All Shown'}
                    </button>
                  </div>

                  <div className="overflow-x-auto overflow-y-auto max-h-96">
                    <div className="min-w-[1024px]">
                      <table className="w-full bg-white shadow sm:rounded-md">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Select
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Name
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Email
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Tags
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filterCandidatesByTags(testCandidates.available).map((candidate) => (
                            <tr key={candidate.id} className="bg-white">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <input 
                                  type="checkbox" 
                                  checked={manageCandidatesSelection.includes(candidate.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setManageCandidatesSelection([...manageCandidatesSelection, candidate.id]);
                                    } else {
                                      setManageCandidatesSelection(manageCandidatesSelection.filter(id => id !== candidate.id));
                                    }
                                  }}
                                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                />
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{candidate.name}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-500">{candidate.email}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
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
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No available candidates to assign.</p>
              )}
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
            <div className="min-w-[1024px]">
              <table className="w-full bg-white rounded-lg overflow-hidden">
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
