const express = require('express');
const instancesRoutes = require('./routes/instances');

const app = express();
app.use(express.json());

app.use('/instances', instancesRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
