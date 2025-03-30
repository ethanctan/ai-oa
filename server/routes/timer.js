const express = require('express');
const router = express.Router();
const timerController = require('../controllers/timerController');

/**
 * Start a timer for a specific instance
 * POST /timer/start
 */
router.post('/start', (req, res) => {
  try {
    const { instanceId } = req.body;
    
    if (!instanceId) {
      return res.status(400).json({
        success: false,
        error: 'Instance ID is required'
      });
    }
    
    console.log(`Route handler: Starting timer for instance ${instanceId}`);
    const timerData = timerController.startTimer(instanceId);
    
    res.json(timerData);
  } catch (error) {
    console.error(`Error starting timer: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get the status of a timer
 * GET /timer/status
 */
router.get('/status', (req, res) => {
  try {
    const { instanceId } = req.query;
    
    if (!instanceId) {
      return res.status(400).json({
        success: false,
        error: 'Instance ID is required'
      });
    }
    
    console.log(`Route handler: Getting timer status for instance ${instanceId}`);
    const timerData = timerController.getTimerStatus(instanceId);
    
    res.json(timerData);
  } catch (error) {
    console.error(`Error getting timer status: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * List all active timers
 * GET /timer/list
 */
router.get('/list', (req, res) => {
  try {
    console.log('Route handler: Listing all timers');
    const timers = timerController.listTimers();
    
    res.json({
      success: true,
      timers
    });
  } catch (error) {
    console.error(`Error listing timers: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Set the interview as started
 * POST /timer/interview-started
 */
router.post('/interview-started', (req, res) => {
  try {
    const { instanceId } = req.body;
    
    if (!instanceId) {
      return res.status(400).json({
        success: false,
        error: 'Instance ID is required'
      });
    }
    
    console.log(`Route handler: Setting interview started for instance ${instanceId}`);
    const result = timerController.setInterviewStarted(instanceId);
    
    res.json(result);
  } catch (error) {
    console.error(`Error setting interview status: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router; 