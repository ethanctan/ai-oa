// routes/instances.js
const express = require('express');
const router = express.Router();
const instancesController = require('../controllers/instancesController');

// GET /instances - List all active instances
router.get('/', async (req, res) => {
  try {
    const instances = await instancesController.listInstances();
    res.json(instances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /instances/details - List instances with detailed information
router.get('/details', async (req, res) => {
  try {
    const instances = await instancesController.listInstancesWithDetails();
    res.json(instances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /instances - Create a new instance for a test
router.post('/', async (req, res) => {
  try {
    const instanceData = req.body;
    const result = await instancesController.createInstance(instanceData);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /instances/:id/report - Submit a report for an instance
router.post('/:id/report', async (req, res) => {
  try {
    const { id } = req.params;
    const text = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Report content is required' });
    }

    const result = await instancesController.saveReport(id, text);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /instances/:id/report - Get the last report for an instance
router.get('/:id/report', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await instancesController.getLastReport(id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /instances/:id - Delete an instance
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await instancesController.deleteInstance(id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 