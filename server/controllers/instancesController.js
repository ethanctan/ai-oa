const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { db } = require('../database/db');

// Import helper functions
let sanitizeName;
let cloneRepo;

try {
  const helpers = require('../helpers/gitHelpers');
  cloneRepo = helpers.cloneRepo;
  sanitizeName = helpers.sanitizeName;
} catch (error) {
  console.warn("gitHelpers not found, git clone functionality may be limited");
}

// Initialize Dockerode to communicate with Docker daemon
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// Base directory where cloned repositories will be stored
const BASE_PROJECTS_DIR = '/tmp/code-server-projects';
if (!fs.existsSync(BASE_PROJECTS_DIR)) {
  fs.mkdirSync(BASE_PROJECTS_DIR, { recursive: true });
}

/**
 * Creates a new Code‑Server instance for a test and candidate.
 * @param {Object} data - The instance configuration data.
 * @param {number} data.testId - ID of the test this instance is for.
 * @param {number} [data.candidateId] - ID of the candidate this instance is for (optional for admin try-test).
 * @param {string} [data.githubUrl] - GitHub repository URL to clone (from test).
 * @param {string} [data.githubToken] - GitHub token for private repos (from test).
 * @param {string} [data.adminUser] - User information for admin testing.
 * @param {Object} [trx] - Optional transaction object for nested transactions.
 * @returns {Promise<Object>} - Object containing instance details.
 */
async function createInstance({ testId, candidateId, githubUrl, githubToken, adminUser }, passedTrx = null) {
  // Use the passed transaction if provided, otherwise create a new one
  const trx = passedTrx || await db.transaction();
  const shouldCommit = !passedTrx; // Only commit if we created the transaction
  
  try {
    // Get the test details to use in instance creation
    const test = await trx('tests').where('id', testId).first();
    if (!test) {
      if (shouldCommit) await trx.rollback();
      throw new Error(`Test with ID ${testId} not found`);
    }
    
    // Generate a unique instance name
    const instanceName = candidateId 
      ? `test-${testId}-candidate-${candidateId}-${Date.now()}`
      : `test-${testId}-admin-${Date.now()}`;
    
    // Sanitize name for Docker
    const sanitizedName = sanitizeName(instanceName);
    
    let finalProjectPath = null;

    // If a GitHub repo is provided, clone it and use that as the workspace.
    if (githubUrl || test.github_repo) {
      const repoUrl = githubUrl || test.github_repo;
      const targetFolder = path.join(BASE_PROJECTS_DIR, `${sanitizedName}`);
      try {
        if (typeof cloneRepo === 'function') {
          await cloneRepo(repoUrl, targetFolder, githubToken || test.github_token, execPromise);
        } else {
          // Fallback to basic git clone
          const gitCommand = (githubToken || test.github_token)
            ? `git clone https://${githubToken || test.github_token}@${repoUrl.replace('https://', '')} ${targetFolder}`
            : `git clone ${repoUrl} ${targetFolder}`;
          await execPromise(gitCommand);
        }
        finalProjectPath = targetFolder;
      } catch (error) {
        if (shouldCommit) await trx.rollback();
        throw new Error(`Error cloning repo: ${error.message}`);
      }
    }

    // Define container configuration for Code‑Server
    const containerConfig = {
      Image: 'my-code-server-with-extension',
      name: sanitizedName,
      Env: [
        `DOCKER_USER=${process.env.USER || 'coder'}`,
        `GITHUB_REPO=${githubUrl || test.github_repo || ''}`,
        `INITIAL_PROMPT=${test.initial_prompt || ''}`,
        `FINAL_PROMPT=${test.final_prompt || ''}`,
        `ASSESSMENT_PROMPT=${test.assessment_prompt || ''}`,
      ],
      ExposedPorts: { '8080/tcp': {} },
      HostConfig: {
        PublishAllPorts: true,  // Lets Docker assign a random port
        Binds: finalProjectPath ? [
          // Mount the project directory into the container at /home/coder/project
          `${finalProjectPath}:/home/coder/project`
        ] : []
      }
    };

    // Create and start container
    const container = await docker.createContainer(containerConfig);
    await container.start();
    
    // Get container info to retrieve the assigned port
    const containerInfo = await container.inspect();
    const dockerId = containerInfo.Id;
    
    // Log container info for debugging
    console.log('Container network settings:', JSON.stringify(containerInfo.NetworkSettings.Ports, null, 2));
    
    // Check if Ports exist and extract the HostPort
    let port = null;
    if (containerInfo.NetworkSettings && containerInfo.NetworkSettings.Ports) {
      const portBindings = containerInfo.NetworkSettings.Ports['8080/tcp'];
      if (portBindings && portBindings.length > 0) {
        port = portBindings[0].HostPort;
      }
    }
    
    if (!port) {
      if (shouldCommit) await trx.rollback();
      throw new Error('Failed to retrieve assigned port for the container');
    }
    
    // Record the instance in the database
    const [instanceId] = await trx('test_instances').insert({
      test_id: testId,
      candidate_id: candidateId || null,
      docker_instance_id: dockerId,
      port: port
    });
    
    // If this is for a candidate, make sure the test_candidates relationship exists
    if (candidateId) {
      // Check if the test-candidate relationship exists
      const existing = await trx('test_candidates')
        .where({ test_id: testId, candidate_id: candidateId })
        .first();
      
      if (!existing) {
        // Create a new test-candidate relationship if it doesn't exist
        await trx('test_candidates').insert({
          test_id: testId,
          candidate_id: candidateId,
          completed: false
        });
        
        // Increment the candidates_assigned count for the test
        await trx('tests')
          .where('id', testId)
          .increment('candidates_assigned', 1);
      }
    }
    
    // Only commit if we created the transaction
    if (shouldCommit) await trx.commit();
    
    return {
      id: instanceId,
      containerId: dockerId,
      name: instanceName,
      port: port,
      testId,
      candidateId: candidateId || null,
      accessUrl: `http://localhost:${port}`
    };
  } catch (error) {
    // Only rollback if we created the transaction
    if (shouldCommit) await trx.rollback();
    throw error;
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
 * List instances in the database with container information.
 * @returns {Promise<Array>} - Array of instance objects with test and candidate info.
 */
async function listInstancesWithDetails() {
  try {
    const instances = await db('test_instances')
      .leftJoin('tests', 'test_instances.test_id', 'tests.id')
      .leftJoin('candidates', 'test_instances.candidate_id', 'candidates.id')
      .select(
        'test_instances.*',
        'tests.name as test_name',
        'candidates.name as candidate_name',
        'candidates.email as candidate_email'
      );
    
    // Fetch container status for each instance
    for (const instance of instances) {
      try {
        const container = docker.getContainer(instance.docker_instance_id);
        const containerInfo = await container.inspect();
        instance.status = containerInfo.State.Status;
        instance.ports = containerInfo.NetworkSettings.Ports;
      } catch (error) {
        instance.status = 'error';
        instance.errorMessage = error.message;
      }
    }
    
    return instances;
  } catch (error) {
    throw new Error(`Error listing instances: ${error.message}`);
  }
}

// Add exports for the functions
exports.createInstance = createInstance;
exports.listInstances = listInstances;
exports.listInstancesWithDetails = listInstancesWithDetails;

/**
 * Deletes a Code‑Server instance.
 * @param {string} instanceId - ID of the instance to delete.
 * @returns {Promise<Object>} - Confirmation message with instance ID.
 */
async function deleteInstance(instanceId) {
  const trx = await db.transaction();
  
  try {
    // Get the instance from the database first
    const instance = await trx('test_instances')
      .where('id', instanceId)
      .or('docker_instance_id', instanceId)
      .first();
    
    if (!instance) {
      await trx.rollback();
      throw new Error(`Instance ${instanceId} not found`);
    }
    
    // Try to stop and remove the Docker container
    try {
      const container = docker.getContainer(instance.docker_instance_id);
      await container.stop();
      await container.remove();
    } catch (dockerError) {
      console.error(`Error with Docker container: ${dockerError.message}`);
      // Continue with database cleanup even if Docker operations fail
    }
    
    // No need to update test_candidates since we're not tracking instance_id there
    
    // Remove the instance from the database
    await trx('test_instances')
      .where('id', instance.id)
      .delete();
    
    await trx.commit();
    
    return { 
      message: 'Instance terminated', 
      instanceId: instance.id,
      dockerId: instance.docker_instance_id 
    };
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}

exports.deleteInstance = deleteInstance;

/**
 * Saves a report for a test instance.
 * @param {string} instanceId - ID of the instance to save report for.
 * @param {string} text - The report content.
 * @returns {Promise<Object>} - Object containing report details.
 */
async function saveReport(instanceId, text) {
  const trx = await db.transaction();
  
  try {
    // Verify the instance exists
    const instance = await trx('test_instances')
      .where('id', instanceId)
      .orWhere('docker_instance_id', instanceId)
      .first();
    
    if (!instance) {
      await trx.rollback();
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Save the report
    const [reportId] = await trx('reports').insert({
      instance_id: instance.id,
      content: text
    });

    await trx.commit();
    
    return {
      id: reportId,
      instanceId: instance.id,
      message: 'Report saved successfully'
    };
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}

exports.saveReport = saveReport;

/**
 * Gets the last saved report for a test instance.
 * @param {string} instanceId - ID of the instance to get report for.
 * @returns {Promise<Object>} - Object containing the last report details.
 */
async function getLastReport(instanceId) {
  const trx = await db.transaction();
  
  try {
    // Verify the instance exists
    const instance = await trx('test_instances')
      .where('id', instanceId)
      .orWhere('docker_instance_id', instanceId)
      .first();
    
    if (!instance) {
      await trx.rollback();
      throw new Error(`Instance ${instanceId} not found`);
    }

    // Get the last report for this instance
    const report = await trx('reports')
      .where('instance_id', instance.id)
      .orderBy('created_at', 'desc')
      .first();

    await trx.commit();
    
    if (!report) {
      return {
        message: 'No report found for this instance'
      };
    }

    return {
      id: report.id,
      instanceId: instance.id,
      content: report.content,
      createdAt: report.created_at
    };
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}

exports.getLastReport = getLastReport; 