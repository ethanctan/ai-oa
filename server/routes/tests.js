const express = require('express');
const router = express.Router();
const testsController = require('../controllers/testsController');

// GET /tests - Get all tests
router.get('/', testsController.getAllTests);

// GET /tests/:id - Get a specific test
router.get('/:id', testsController.getTestById);

// GET /tests/:id/candidates - Get candidates for a specific test
router.get('/:id/candidates', testsController.getCandidatesForTest);

// POST /tests - Create a new test
router.post('/', testsController.createTest);

// DELETE /tests/:id - Delete a test
router.delete('/:id', testsController.deleteTest);

// POST /tests/:id/try - Try a test as admin
router.post('/:id/try', testsController.tryTest);

// POST /tests/:id/send - Send a test to candidates
router.post('/:id/send', testsController.sendTestToCandidates);

module.exports = router; 