# AI Technical Interviewer Extension

A VSCode extension that provides an AI-powered technical interviewer for coding assessments. This extension is designed to guide candidates through a complete assessment process including:

1. **Pre-interview**: Initial questions about the candidate's approach and understanding
2. **Coding Task**: Space for the candidate to work on the coding project
3. **Post-interview**: Final review of the implementation and design decisions

## Features

- **Automated Initial Interview**: Automatically starts when the extension loads
- **Progress Tracking**: Clear indication of which phase of the interview is active
- **Final Interview Button**: Candidate can trigger the final interview when ready
- **Environment Variable Integration**: Uses prompts passed to the Docker container
- **Real-time Code Awareness**: The AI interviewer has access to the workspace content

## How It Works

1. When a candidate opens the VSCode environment, the extension automatically activates and opens the interview panel.
2. The extension reads environment variables (`INITIAL_PROMPT`, `FINAL_PROMPT`, and `ASSESSMENT_PROMPT`) that were passed to the Docker container.
3. The initial interview starts automatically, using the `INITIAL_PROMPT` as guidance for the AI.
4. After the initial interview, a "Start Final Interview" button appears in the chat interface.
5. The candidate can work on the coding task and click the button when ready for the final review.
6. The final interview uses the `FINAL_PROMPT` to guide the AI for a comprehensive review.

## For Administrators

When setting up a test, administrators can customize the interview experience by configuring:

- **Initial Prompt**: Questions to ask before coding begins
- **Final Prompt**: Questions to ask after coding is complete
- **Assessment Prompt**: Guidelines for evaluating the candidate's work

These prompts are passed as environment variables to the Docker container and automatically used by the extension.

## Technical Details

- The extension communicates with a backend server for AI responses
- Workspace content is sent to provide context about the candidate's code
- The chat interface adapts to VSCode themes and styling
- All communication happens through secure WebView messaging

## Development

To develop or modify this extension:

1. Clone the repository
2. Run `npm install` in the extension directory
3. Make your changes
4. Test using `F5` in VSCode to launch the extension development host

## License

MIT
