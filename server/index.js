const express = require('express');
const chatRoutes = require('./routes/chat');
const candidatesRoutes = require('./routes/candidates');
const testsRoutes = require('./routes/tests');
const instancesRoutes = require('./routes/instances');
const timerRoutes = require('./routes/timer');
const { initDatabase } = require('./database/db');
const cors = require('cors');

const app = express();

// Middleware
app.use(express.json());
app.use(cors()); // Enable CORS for frontend access

// Initialize database
(async () => {
  try {
    await initDatabase();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
})();

// Routes
app.use('/chat', chatRoutes);
app.use('/candidates', candidatesRoutes);
app.use('/tests', testsRoutes);
app.use('/instances', instancesRoutes);
app.use('/timer', timerRoutes);

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
