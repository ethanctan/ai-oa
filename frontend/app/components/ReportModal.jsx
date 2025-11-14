function ReportModal({ isOpen, report, onClose, isLoading = false, title = "Test Report" }) {
  if (!isOpen) {
    return null;
  }

  const renderTimestamp = (value) => {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toLocaleString();
  };

  const hasReportPayload = report && !report.message;

  return (
    <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-4xl w-full max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
            aria-label="Close report modal"
          >
            &times;
          </button>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-gray-500">
            Loading report...
          </div>
        ) : !hasReportPayload ? (
          <p className="text-gray-500">
            {report?.message || "No report is available for this instance yet."}
          </p>
        ) : (
          <div>
            {renderTimestamp(report?.created_at) && (
              <div className="mb-4">
                <p className="text-sm text-gray-500">
                  Created at: {renderTimestamp(report.created_at)}
                </p>
              </div>
            )}

            {report?.content ? (
              <div className="bg-gray-50 p-4 rounded-lg">
                <pre className="whitespace-pre-wrap font-sans">
                  {report.content}
                </pre>
              </div>
            ) : (
              <div className="space-y-6">
                {report?.submission_repo_link && (
                  <div>
                    <h4 className="text-lg font-semibold mb-2">Submission Repository</h4>
                    <a
                      href={report.submission_repo_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 break-all"
                    >
                      {report.submission_repo_link}
                    </a>
                    {report?.target_repository && (
                      <p className="text-xs text-gray-500 mt-1">
                        Base repository: {report.target_repository}
                      </p>
                    )}
                  </div>
                )}

                {Array.isArray(report?.qualitative_criteria_template) && report.qualitative_criteria_template.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold mb-2">Configured Qualitative Criteria</h4>
                    <div className="space-y-3">
                      {report.qualitative_criteria_template.map((criterion, idx) => (
                        <div key={`template-qual-${idx}`} className="bg-white border border-gray-200 rounded p-4">
                          <div className="font-semibold text-gray-900">{criterion.title || `Criterion ${idx + 1}`}</div>
                          {criterion.description && (
                            <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{criterion.description}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(report?.quantitative_criteria_template) && report.quantitative_criteria_template.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold mb-2">Configured Quantitative Criteria</h4>
                    <div className="space-y-3">
                      {report.quantitative_criteria_template.map((criterion, idx) => {
                        const descriptorEntries = Object.entries(criterion || {})
                          .filter(([key]) => key !== "title" && key.trim() !== "")
                          .map(([key, value]) => ({ score: key, description: value }))
                          .filter((entry) => entry.description && entry.description.trim() !== "")
                          .sort((a, b) => {
                            const scoreA = Number(a.score);
                            const scoreB = Number(b.score);
                            if (Number.isNaN(scoreA) || Number.isNaN(scoreB)) {
                              return a.score.localeCompare(b.score);
                            }
                            return scoreA - scoreB;
                          });

                        return (
                          <div key={`template-quant-${idx}`} className="bg-white border border-gray-200 rounded p-4 space-y-3">
                            <div className="font-semibold text-gray-900">{criterion.title || `Criterion ${idx + 1}`}</div>
                            {descriptorEntries.length > 0 ? (
                              <div className="space-y-2">
                                {descriptorEntries.map((entry) => (
                                  <div
                                    key={`${idx}-${entry.score}`}
                                    className="text-sm text-gray-700 flex flex-col sm:flex-row sm:items-start sm:gap-3"
                                  >
                                    <span className="font-medium text-gray-900 w-16">Score {entry.score}</span>
                                    <span className="flex-1 whitespace-pre-wrap">{entry.description}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">No score descriptors provided.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {report?.code_summary && (
                  <div>
                    <h4 className="text-lg font-semibold mb-2">Code Summary</h4>
                    <p className="text-gray-800 whitespace-pre-wrap">{report.code_summary}</p>
                  </div>
                )}

                {report?.initial_interview_summary && (
                  <div>
                    <h4 className="text-lg font-semibold mb-2">Initial Interview Summary</h4>
                    <p className="text-gray-800 whitespace-pre-wrap">{report.initial_interview_summary}</p>
                  </div>
                )}

                {report?.final_interview_summary && (
                  <div>
                    <h4 className="text-lg font-semibold mb-2">Final Interview Summary</h4>
                    <p className="text-gray-800 whitespace-pre-wrap">{report.final_interview_summary}</p>
                  </div>
                )}

                {Array.isArray(report?.qualitative_criteria) && report.qualitative_criteria.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold mb-2">Qualitative Criteria</h4>
                    <div className="space-y-3">
                      {report.qualitative_criteria.map((criterion, idx) => (
                        <div key={`qual-${idx}`} className="bg-gray-50 p-3 rounded">
                          <div className="font-medium">{criterion.title}</div>
                          <p className="text-gray-800 text-sm whitespace-pre-wrap">{criterion.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(report?.quantitative_criteria) && report.quantitative_criteria.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold mb-2">Quantitative Criteria</h4>
                    <div className="space-y-3">
                      {report.quantitative_criteria.map((criterion, idx) => (
                        <div key={`quant-${idx}`} className="bg-gray-50 p-3 rounded">
                          <div className="font-medium">
                            {criterion.title}{" "}
                            {typeof criterion.score !== "undefined" && (
                              <span className="text-gray-600 font-normal">- Score: {criterion.score}</span>
                            )}
                          </div>
                          {criterion.explanation && (
                            <p className="text-gray-800 text-sm whitespace-pre-wrap">{criterion.explanation}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {report?.report_warnings && (
                  <div>
                    <h4 className="text-lg font-semibold mb-2">Warnings</h4>
                    <p className="text-gray-800 whitespace-pre-wrap">{report.report_warnings}</p>
                  </div>
                )}

                {Array.isArray(report?.initial_interview_log) && report.initial_interview_log.length > 0 && (
                  <details className="bg-gray-50 border border-gray-200 rounded p-4">
                    <summary className="cursor-pointer font-semibold text-gray-900">
                      Initial Interview Log ({report.initial_interview_log.length} messages)
                    </summary>
                    <div className="mt-3 space-y-3">
                      {report.initial_interview_log.map((entry, idx) => (
                        <div key={`initial-log-${idx}`} className="border-l-4 border-blue-200 pl-3">
                          <div className="text-xs text-gray-500 mb-1">
                            {renderTimestamp(entry.created_at) || "Timestamp unknown"} ·{" "}
                            {entry.role === "assistant" ? "Interviewer" : "Candidate"}
                          </div>
                          <div className="text-sm text-gray-800 whitespace-pre-wrap">{entry.content}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {Array.isArray(report?.project_helper_log) && report.project_helper_log.length > 0 && (
                  <details className="bg-gray-50 border border-gray-200 rounded p-4">
                    <summary className="cursor-pointer font-semibold text-gray-900">
                      Project Helper Log ({report.project_helper_log.length} messages)
                    </summary>
                    <div className="mt-3 space-y-3">
                      {report.project_helper_log.map((entry, idx) => (
                        <div key={`project-log-${idx}`} className="border-l-4 border-purple-200 pl-3">
                          <div className="text-xs text-gray-500 mb-1">
                            {renderTimestamp(entry.created_at) || 'Timestamp unknown'} · {entry.role === 'assistant' ? 'Helper' : 'Candidate'}
                          </div>
                          <div className="text-sm text-gray-800 whitespace-pre-wrap">{entry.content}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {Array.isArray(report?.final_interview_log) && report.final_interview_log.length > 0 && (
                  <details className="bg-gray-50 border border-gray-200 rounded p-4">
                    <summary className="cursor-pointer font-semibold text-gray-900">
                      Final Interview Log ({report.final_interview_log.length} messages)
                    </summary>
                    <div className="mt-3 space-y-3">
                      {report.final_interview_log.map((entry, idx) => (
                        <div key={`final-log-${idx}`} className="border-l-4 border-green-200 pl-3">
                          <div className="text-xs text-gray-500 mb-1">
                            {renderTimestamp(entry.created_at) || "Timestamp unknown"} ·{" "}
                            {entry.role === "assistant" ? "Interviewer" : "Candidate"}
                          </div>
                          <div className="text-sm text-gray-800 whitespace-pre-wrap">{entry.content}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReportModal;

