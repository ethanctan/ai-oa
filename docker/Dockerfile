# Use the official code-server image as the base image
FROM codercom/code-server:latest

# Switch to root user for package installation
USER root

# Install Rust and Cargo
RUN apt-get update && apt-get install -y \
    build-essential \
    curl

# Switch back to coder user before installing Rust
USER coder

# Install Rust for the coder user
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y \
    && . $HOME/.cargo/env

# Add coder user's Cargo to PATH
ENV PATH="/home/coder/.cargo/bin:${PATH}"

# Install code2prompt using Cargo (as coder user)
RUN . $HOME/.cargo/env && cargo install code2prompt

# Make sure the binary is in the PATH
RUN echo 'export PATH="/home/coder/.cargo/bin:$PATH"' >> /home/coder/.bashrc

# Switch back to root to copy and install the extension
USER root

# Copy chatbot extension VSIX file into the container
COPY ai-oa-extension-0.1.0.vsix /tmp/ai-oa-extension-0.1.0.vsix

# Switch back to coder to install the extension
USER coder

# Install the extension
RUN code-server --install-extension /tmp/ai-oa-extension-0.1.0.vsix 

# Run code-server
EXPOSE 8080
CMD ["code-server", "--auth", "none", "--bind-addr", "0.0.0.0:8080", "/home/coder/project"]