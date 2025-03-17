const express = require('express');
const instancesRoutes = require('./routes/instances');
const chatRoute = require('./routes/chat'); 

const app = express();
app.use(express.json());

// Routes

app.use('/instances', instancesRoutes);
app.use('/chat', chatRoute);

// Start server

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
