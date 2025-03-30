const fs = require('fs');
const path = require('path');

// Path to the timer data file
const TIMER_DATA_FILE = path.join(__dirname, '../data/timers.json');

// Store timers with instanceId as the key
const timers = new Map();

/**
 * Load timers from persistent storage
 */
function loadTimers() {
  try {
    // Create data directory if it doesn't exist
    const dataDir = path.dirname(TIMER_DATA_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log(`Created data directory: ${dataDir}`);
    }

    // Check if timer data file exists
    if (!fs.existsSync(TIMER_DATA_FILE)) {
      console.log(`Timer data file does not exist. Creating empty file at: ${TIMER_DATA_FILE}`);
      fs.writeFileSync(TIMER_DATA_FILE, JSON.stringify({}));
      return;
    }

    // Load timers
    const data = fs.readFileSync(TIMER_DATA_FILE, 'utf8');
    const timerData = JSON.parse(data);
    
    // Clear current timers
    timers.clear();
    
    // Restore timers and filter out expired ones
    const now = Date.now();
    let expiredCount = 0;
    
    Object.entries(timerData).forEach(([instanceId, timer]) => {
      if (timer.endTime > now) {
        timers.set(instanceId, timer);
      } else {
        expiredCount++;
      }
    });
    
    console.log(`Loaded ${timers.size} active timers, filtered out ${expiredCount} expired timers`);
  } catch (error) {
    console.error(`Error loading timers: ${error.message}`);
  }
}

/**
 * Save timers to persistent storage
 */
function saveTimers() {
  try {
    // Convert Map to object for JSON serialization
    const timerData = {};
    timers.forEach((timer, instanceId) => {
      timerData[instanceId] = timer;
    });
    
    // Save to file
    fs.writeFileSync(TIMER_DATA_FILE, JSON.stringify(timerData, null, 2));
    console.log(`Saved ${timers.size} timers to ${TIMER_DATA_FILE}`);
  } catch (error) {
    console.error(`Error saving timers: ${error.message}`);
  }
}

/**
 * Start a timer for a specific instance
 * @param {string} instanceId - The ID of the instance to start a timer for
 * @returns {Object} Timer data including endTime
 */
function startTimer(instanceId) {
  // Check if timer exists
  if (timers.has(instanceId)) {
    const timer = timers.get(instanceId);
    const timeRemaining = timer.endTime - Date.now();
    
    // If timer has more than 1 second remaining, return existing timer
    if (timeRemaining > 1000) {
      console.log(`Timer already exists for instance ${instanceId} with ${timeRemaining}ms remaining`);
      return {
        timerStarted: true,
        endTime: timer.endTime,
        instanceId,
        interviewStarted: timer.interviewStarted || false,
        message: `Timer already running with ${Math.ceil(timeRemaining / 1000)} seconds remaining`
      };
    }
  }
  
  // Create a new timer (10 minutes)
  const endTime = Date.now() + (10 * 60 * 1000);
  
  // Store the timer with instance ID as key
  timers.set(instanceId, { 
    startedAt: Date.now(),
    endTime,
    instanceId,
    interviewStarted: false
  });
  
  // Save timers to persistent storage
  saveTimers();
  
  console.log(`Started new timer for instance ${instanceId}, ends at ${new Date(endTime).toISOString()}`);
  
  return {
    timerStarted: true,
    endTime,
    instanceId,
    interviewStarted: false,
    message: 'Timer started for 10 minutes'
  };
}

/**
 * Get the status of a timer
 * @param {string} instanceId - The ID of the instance to get timer status for
 * @returns {Object} Timer status data
 */
function getTimerStatus(instanceId) {
  // Check if timer exists
  if (timers.has(instanceId)) {
    const timer = timers.get(instanceId);
    const now = Date.now();
    
    // Check if timer has expired
    if (timer.endTime <= now) {
      console.log(`Timer for instance ${instanceId} has expired`);
      
      // Don't delete the timer if the interview has started - just keep the state
      if (!timer.interviewStarted) {
        timers.delete(instanceId);
        saveTimers();
      }
      
      return {
        timerStarted: false,
        expired: true,
        instanceId,
        interviewStarted: timer.interviewStarted || false,
        message: 'Timer has expired'
      };
    }
    
    // Return timer status
    const timeRemaining = timer.endTime - now;
    console.log(`Timer for instance ${instanceId} has ${timeRemaining}ms remaining`);
    
    return {
      timerStarted: true,
      endTime: timer.endTime,
      instanceId,
      interviewStarted: timer.interviewStarted || false,
      message: `Timer has ${Math.ceil(timeRemaining / 1000)} seconds remaining`
    };
  }
  
  console.log(`No timer found for instance ${instanceId}`);
  
  // No timer exists
  return {
    timerStarted: false,
    instanceId,
    interviewStarted: false,
    message: 'No timer found'
  };
}

/**
 * Set the interview as started for an instance
 * @param {string} instanceId - The ID of the instance
 * @returns {Object} Updated status
 */
function setInterviewStarted(instanceId) {
  if (!instanceId) {
    return { error: 'Instance ID is required' };
  }
  
  // Create timer object if it doesn't exist
  if (!timers.has(instanceId)) {
    startTimer(instanceId);
  }
  
  // Mark interview as started
  const timer = timers.get(instanceId);
  timer.interviewStarted = true;
  
  // Save to persistent storage
  saveTimers();
  
  console.log(`Interview marked as started for instance ${instanceId}`);
  
  return {
    success: true,
    instanceId,
    interviewStarted: true
  };
}

/**
 * List all active timers
 * @returns {Array} List of active timers
 */
function listTimers() {
  const timerList = [];
  
  timers.forEach((timer, instanceId) => {
    const now = Date.now();
    
    // Skip expired timers
    if (timer.endTime <= now) {
      return;
    }
    
    const timeRemaining = timer.endTime - now;
    timerList.push({
      instanceId,
      timeRemaining,
      endTime: timer.endTime
    });
  });
  
  return timerList;
}

// Load existing timers when module is initialized
loadTimers();

// Export functions for use in routes
module.exports = {
  startTimer,
  getTimerStatus,
  listTimers,
  setInterviewStarted
}; 