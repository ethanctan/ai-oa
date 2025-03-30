//controllers/testsController.js

const { db } = require('../database/db');
const Docker = require('dockerode');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Import helper functions if they exist
let cloneRepo;
let sanitizeName;

try {
  ({ cloneRepo, sanitizeName } = require('../helpers/gitHelpers'));
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

// Get all tests
exports.getAllTests = async (req, res) => {
  try {
    const tests = await db('tests')
      .select('*')
      .orderBy('created_at', 'desc');
    
    res.json(tests);
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ error: 'Failed to fetch tests' });
  }
};

// Get a specific test by ID
exports.getTestById = async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get test details
    const test = await db('tests')
      .where('id', id)
      .first();
    
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    // Get all candidates assigned to this test
    const candidates = await db('test_candidates')
      .join('candidates', 'test_candidates.candidate_id', '=', 'candidates.id')
      .where('test_candidates.test_id', id)
      .select(
        'candidates.id',
        'candidates.name',
        'candidates.email',
        'test_candidates.completed'
      );
    
    test.assignedCandidates = candidates;
    
    // Get instances for this test
    const instances = await db('test_instances')
      .where('test_id', id)
      .select('*');
    
    test.instances = instances;
    
    res.json(test);
  } catch (error) {
    console.error('Error fetching test:', error);
    res.status(500).json({ error: 'Failed to fetch test' });
  }
};

// Create a new test
exports.createTest = async (req, res) => {
  const { 
    instanceName, 
    githubRepo, 
    githubToken, 
    initialPrompt, 
    finalPrompt, 
    assessmentPrompt,
    candidateIds = [] 
  } = req.body;
  
  const trx = await db.transaction();
  
  try {
    // Insert test into database
    const [testId] = await trx('tests')
      .insert({
        name: instanceName,
        github_repo: githubRepo,
        github_token: githubToken,
        initial_prompt: initialPrompt,
        final_prompt: finalPrompt,
        assessment_prompt: assessmentPrompt,
        candidates_assigned: candidateIds.length,
        candidates_completed: 0
      });
    
    // Clone repository if provided (for future use)
    let finalProjectPath = null;
    if (githubRepo) {
      const targetFolder = path.join(BASE_PROJECTS_DIR, `${sanitizeName(instanceName)}-${Date.now()}`);
      try {
        // If cloneRepo is available, use it
        if (typeof cloneRepo === 'function') {
          await cloneRepo(githubRepo, targetFolder, githubToken, execPromise);
        } else {
          // Fallback to basic git clone
          const gitCommand = githubToken 
            ? `git clone https://${githubToken}@${githubRepo.replace('https://', '')} ${targetFolder}`
            : `git clone ${githubRepo} ${targetFolder}`;
          await execPromise(gitCommand);
        }
        finalProjectPath = targetFolder;
      } catch (error) {
        await trx.rollback();
        return res.status(500).json({ error: `Error cloning repo: ${error.message}` });
      }
    }
    
    // Assign candidates to the test if provided
    if (candidateIds.length > 0) {
      const candidateAssignments = candidateIds.map(candidateId => ({
        test_id: testId,
        candidate_id: candidateId,
        completed: false
      }));
      
      await trx('test_candidates').insert(candidateAssignments);
    }
    
    await trx.commit();
    
    res.status(201).json({
      id: testId,
      name: instanceName,
      github_repo: githubRepo,
      message: "Test created successfully. No instance was created automatically."
    });
  } catch (error) {
    await trx.rollback();
    console.error('Error creating test:', error);
    res.status(500).json({ error: 'Failed to create test' });
  }
};

// Delete a test
exports.deleteTest = async (req, res) => {
  const { id } = req.params;
  
  const trx = await db.transaction();
  
  try {
    // Get instances for this test
    const instances = await trx('test_instances')
      .where('test_id', id)
      .select('docker_instance_id');
    
    // Stop and remove docker containers
    for (const instance of instances) {
      try {
        const container = docker.getContainer(instance.docker_instance_id);
        await container.stop();
        await container.remove();
      } catch (containerError) {
        console.error(`Error removing container: ${containerError.message}`);
        // Continue with deletion even if container removal fails
      }
    }
    
    // Delete all related records
    await trx('test_candidates').where('test_id', id).delete();
    await trx('test_instances').where('test_id', id).delete();
    await trx('tests').where('id', id).delete();
    
    await trx.commit();
    
    res.json({ success: true, message: 'Test deleted successfully' });
  } catch (error) {
    await trx.rollback();
    console.error('Error deleting test:', error);
    res.status(500).json({ error: 'Failed to delete test' });
  }
};

// Get candidates for a specific test
exports.getCandidatesForTest = async (req, res) => {
  const { id } = req.params;
  
  try {
    // Get candidates already assigned to this test
    const assignedCandidates = await db('test_candidates')
      .join('candidates', 'test_candidates.candidate_id', '=', 'candidates.id')
      .where('test_candidates.test_id', id)
      .select(
        'candidates.id',
        'candidates.name',
        'candidates.email',
        'test_candidates.completed'
      );
    
    // Get all candidates not assigned to this test
    const availableCandidates = await db('candidates')
      .whereNotIn('id', function() {
        this.select('candidate_id')
          .from('test_candidates')
          .where('test_id', id);
      })
      .select('id', 'name', 'email');
    
    res.json({
      assigned: assignedCandidates,
      available: availableCandidates
    });
  } catch (error) {
    console.error('Error fetching candidates for test:', error);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
};

// Try a test as an admin
exports.tryTest = async (req, res) => {
  const { id } = req.params;
  const { adminUser } = req.body;
  
  if (!adminUser) {
    return res.status(400).json({ error: 'Admin user information is required' });
  }
  
  try {
    // Get the test details
    const test = await db('tests').where('id', id).first();
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    // Create an instance for this test
    const instancesController = require('./instancesController');
    
    const instance = await instancesController.createInstance({
      testId: id,
      githubUrl: test.github_repo,
      githubToken: test.github_token,
      adminUser
    });
    
    res.json({
      success: true,
      message: 'Test instance created for admin',
      instance,
      accessUrl: `http://localhost:${instance.port}`
    });
  } catch (error) {
    console.error('Error creating test instance for admin:', error);
    res.status(500).json({ error: `Failed to create test instance: ${error.message}` });
  }
};

// Send a test to selected candidates
exports.sendTestToCandidates = async (req, res) => {
  const { id } = req.params;
  const { candidateIds } = req.body;
  
  if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
    return res.status(400).json({ error: 'At least one candidate ID is required' });
  }
  
  const trx = await db.transaction();
  
  try {
    // Get the test
    const test = await trx('tests').where('id', id).first();
    if (!test) {
      await trx.rollback();
      return res.status(404).json({ error: 'Test not found' });
    }
    
    // Check which candidates are already assigned
    const existingAssignments = await trx('test_candidates')
      .where('test_id', id)
      .whereIn('candidate_id', candidateIds)
      .select('candidate_id');
    
    const existingCandidateIds = existingAssignments.map(item => item.candidate_id);
    const newCandidateIds = candidateIds.filter(id => !existingCandidateIds.includes(id));
    
    // Create assignments for new candidates
    if (newCandidateIds.length > 0) {
      const candidateAssignments = newCandidateIds.map(candidateId => ({
        test_id: id,
        candidate_id: candidateId,
        completed: false
      }));
      
      await trx('test_candidates').insert(candidateAssignments);
      
      // Update the candidates_assigned count
      await trx('tests')
        .where('id', id)
        .increment('candidates_assigned', newCandidateIds.length);
    }
    
    // Create instances for all candidates
    const instancesController = require('./instancesController');
    const createdInstances = [];
    
    for (const candidateId of candidateIds) {
      try {
        // Pass the transaction to createInstance to ensure everything is part of the same transaction
        const instance = await instancesController.createInstance({
          testId: id,
          candidateId,
          githubUrl: test.github_repo,
          githubToken: test.github_token
        }, trx);
        
        createdInstances.push(instance);
      } catch (err) {
        console.error(`Error creating instance for candidate ${candidateId}:`, err);
        // Continue with other candidates even if one fails
      }
    }
    
    await trx.commit();
    
    res.json({
      success: true,
      message: `Test sent to ${createdInstances.length} candidates`,
      candidates: createdInstances.map(instance => ({
        candidateId: instance.candidateId,
        instanceId: instance.id,
        accessUrl: instance.accessUrl
      }))
    });
  } catch (error) {
    await trx.rollback();
    console.error('Error sending test to candidates:', error);
    res.status(500).json({ error: `Failed to send test: ${error.message}` });
  }
}; 