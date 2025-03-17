// controllers/instancesController.js

const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Import helper functions
const {
    cloneRepo
} = require('../helpers/gitHelpers');

// Initialize Dockerode to communicate with Docker daemon
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Base directory where cloned repositories will be stored
const BASE_PROJECTS_DIR = '/tmp/code-server-projects';
if (!fs.existsSync(BASE_PROJECTS_DIR)) {
  fs.mkdirSync(BASE_PROJECTS_DIR, { recursive: true });
}

/**
 * Creates a new Code‑Server instance.
 * @param {Object} data - The instance configuration data.
 * @param {string} data.instanceName - Unique name for the instance.
 * @param {string} [data.projectPath] - Local project path (optional).
 * @param {string} [data.githubRepo] - GitHub repository URL to clone (optional).
 * @param {string} [data.githubToken] - GitHub token for private repos (optional).
 * @param {string} [data.portMapping] - Host port mapping for container.
 * @returns {Promise<Object>} - Object containing instance details.
 */
async function createInstance({ instanceName, projectPath, githubRepo, githubToken, portMapping }) {
  let finalProjectPath = projectPath; // Default to provided projectPath

  // If a GitHub repo is provided, clone it and use that as the workspace.
  if (githubRepo) {
    const targetFolder = path.join(BASE_PROJECTS_DIR, `${instanceName}-${Date.now()}`);
    try {
      await cloneRepo(githubRepo, targetFolder, githubToken, execPromise);
      finalProjectPath = targetFolder;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  // Define container configuration for Code‑Server
  const containerConfig = {
    Image: 'my-code-server-with-extension',
    name: instanceName,
    Env: [
      `DOCKER_USER=${process.env.USER || 'coder'}`
    ],
    ExposedPorts: { '8080/tcp': {} },
    HostConfig: {
      PortBindings: {
        '8080/tcp': [
          { HostPort: portMapping || '8080' }
        ]
      },
      Binds: [
        // Mount the project directory into the container at /home/coder/project
        `${finalProjectPath}:/home/coder/project`
      ]
    }
  };

  try {
    const container = await docker.createContainer(containerConfig);
    await container.start();
    return {
      containerId: container.id,
      instanceName,
      port: portMapping || '8080'
    };
  } catch (error) {
    throw new Error(`Error creating container: ${error.message}`);
  }
}

/**
 * Lists all active Code‑Server instances (containers).
 * @returns {Promise<Array>} - Array of active container objects.
 */
async function listInstances() {
  try {
    const containers = await docker.listContainers({ all: false });
    return containers;
  } catch (error) {
    throw new Error(`Error listing containers: ${error.message}`);
  }
}

/**
 * Terminates a Code‑Server instance.
 * @param {string} instanceId - The Docker container ID.
 * @returns {Promise<Object>} - Confirmation message with instance ID.
 */
async function deleteInstance(instanceId) {
  try {
    const container = docker.getContainer(instanceId);
    await container.stop();
    await container.remove();
    return { message: 'Instance terminated', containerId: instanceId };
  } catch (error) {
    throw new Error(`Error deleting container: ${error.message}`);
  }
}

module.exports = {
  createInstance,
  listInstances,
  deleteInstance,
};
