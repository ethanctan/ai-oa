How to deploy changes

1. Compile the extension here with `vsce package`
2. Copy the resulting .vsix file to the ../docker directory
3. Run ./build.sh in the ../docker directory to build a new Docker image with the updated extension
4. Push the new image to Docker Hub
5. Pull the new image on the droplet
