# Use the official code-server image as the base image
FROM --platform=$TARGETPLATFORM codercom/code-server:latest

# Switch to root user for package installation
USER root

# Install Rust and Cargo
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    git

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

# Switch back to root to copy files and set up the container
USER root

# Copy chatbot extension VSIX file into the container
COPY ai-oa-extension-0.1.0.vsix /tmp/ai-oa-extension-0.1.0.vsix

# Copy startup script
COPY startup.sh /usr/local/bin/startup.sh

# Make startup script executable
RUN chmod +x /usr/local/bin/startup.sh

# Switch back to coder to install the extension
USER coder

# Create project directory
RUN mkdir -p /home/coder/project

# Install the extension
RUN code-server --install-extension /tmp/ai-oa-extension-0.1.0.vsix 

# Switch back to root for final setup
USER root

# Run code-server
EXPOSE 8080

# Set environment variables
ENV SHELL=/bin/bash
ENV SERVER_URL=http://167.99.52.130:3000

# Use our startup script which handles git clone and starts code-server
CMD ["/usr/local/bin/startup.sh"]