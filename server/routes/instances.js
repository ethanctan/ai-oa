// routes/instances.js
const express = require('express');
const router = express.Router();

// Import functions from controller
const {
  createInstance,
  listInstances,
  deleteInstance
} = require('../controllers/instancesController');

// POST /instances - Create a new Code-Server instance
router.post('/', async (req, res) => {
  try {
    const result = await createInstance(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /instances - List active instances
router.get('/', async (req, res) => {
  try {
    const instances = await listInstances();
    res.json(instances);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /instances/:id - Terminate a specific instance
router.delete('/:id', async (req, res) => {
  try {
    const result = await deleteInstance(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
