
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 80;

// Start Python backend
console.log('Starting Python backend...');
const pythonProcess = spawn('python3', ['main.py'], {
  stdio: 'inherit'
});

// Give Python backend time to start
setTimeout(() => {
  console.log('Python backend should be running on port 8050');
}, 3000);

// Proxy API requests to Python backend
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:8050',
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error('Proxy error:', err);
    res.status(500).send('Backend service unavailable');
  }
}));

// Serve static files from React build
app.use(express.static(path.join(__dirname, 'frontend/build')));

// Handle React routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle process cleanup
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  pythonProcess.kill();
  process.exit(0);
});
