const { createApp } = require('./server');
const { PORT } = require('./config');

const app = createApp();
app.listen(PORT, () => {
  console.log(`Prototype Coder running on http://localhost:${PORT}`);
});
