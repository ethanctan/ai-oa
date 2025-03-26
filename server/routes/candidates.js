const express = require('express');
const router = express.Router();
const candidatesController = require('../controllers/candidatesController');

// GET /candidates - Get all candidates
router.get('/', candidatesController.getAllCandidates);

// GET /candidates/:id - Get a specific candidate
router.get('/:id', candidatesController.getCandidateById);

// PUT /candidates/:id - Update a candidate's status
router.put('/:id', candidatesController.updateCandidateStatus);

module.exports = router; 