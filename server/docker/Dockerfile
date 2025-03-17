# Use the official code-server image as the base image
FROM codercom/code-server:latest

# Copy chatbot extension VSIX file into the container
COPY ai-oa-extension-0.0.1.vsix /tmp/ai-oa-extension-0.0.1.vsix

# Install the extension
RUN code-server --install-extension /tmp/ai-oa-extension-0.0.1.vsix 

# Run code-server
EXPOSE 8080
CMD ["code-server", "--auth", "none", "--bind-addr", "0.0.0.0:8080", "/home/coder/project"]