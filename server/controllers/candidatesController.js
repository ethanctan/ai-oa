const { db } = require('../database/db');

// Get all candidates
exports.getAllCandidates = async (req, res) => {
  try {
    // Get all candidates with their assigned tests
    const candidates = await db('candidates')
      .select('candidates.*')
      .orderBy('candidates.id');
    
    // For each candidate, get their tests
    for (let candidate of candidates) {
      const testAssignments = await db('test_candidates')
        .join('tests', 'test_candidates.test_id', '=', 'tests.id')
        .where('test_candidates.candidate_id', candidate.id)
        .select('tests.name', 'tests.id', 'test_candidates.completed');
      
      candidate.testsAssigned = testAssignments.map(test => ({
        id: test.id,
        name: test.name,
        completed: test.completed
      }));
    }
    
    res.json(candidates);
  } catch (error) {
    console.error('Error fetching candidates:', error);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
};

// Get a specific candidate by ID
exports.getCandidateById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const candidate = await db('candidates')
      .where('id', id)
      .first();
    
    if (!candidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    
    // Get tests assigned to this candidate
    const testAssignments = await db('test_candidates')
      .join('tests', 'test_candidates.test_id', '=', 'tests.id')
      .where('test_candidates.candidate_id', id)
      .select('tests.name', 'tests.id', 'test_candidates.completed');
    
    candidate.testsAssigned = testAssignments.map(test => ({
      id: test.id,
      name: test.name,
      completed: test.completed
    }));
    
    res.json(candidate);
  } catch (error) {
    console.error('Error fetching candidate:', error);
    res.status(500).json({ error: 'Failed to fetch candidate' });
  }
};

// Update candidate completion status
exports.updateCandidateStatus = async (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;
  
  try {
    const updatedCandidate = await db('candidates')
      .where('id', id)
      .update({ completed }, ['id', 'name', 'email', 'completed']);
    
    if (!updatedCandidate) {
      return res.status(404).json({ error: 'Candidate not found' });
    }
    
    res.json(updatedCandidate[0]);
  } catch (error) {
    console.error('Error updating candidate:', error);
    res.status(500).json({ error: 'Failed to update candidate' });
  }
}; 