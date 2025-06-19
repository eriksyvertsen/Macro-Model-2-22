
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 80;

// Start Python backend
console.log('Starting Python backend...');
const pythonProcess = spawn('python3', ['main.py'], {
  stdio: 'inherit',
  env: { ...process.env, PORT: '8050' }
});

pythonProcess.on('error', (error) => {
  console.error('Failed to start Python backend:', error);
});

pythonProcess.on('close', (code) => {
  console.log(`Python backend exited with code ${code}`);
});

// Give Python backend more time to start
setTimeout(() => {
  console.log('Python backend should be running on port 8050');
}, 5000);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Proxy API requests to Python backend
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:8050',
  changeOrigin: true,
  timeout: 30000,
  proxyTimeout: 30000,
  onError: (err, req, res) => {
    console.error('Proxy error:', err.message, 'for URL:', req.url);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Backend service unavailable', 
        details: err.message,
        timestamp: new Date().toISOString()
      });
    }
  },
  onProxyReq: (proxyReq, req, res) => {
    console.log('Proxying request:', req.method, req.url);
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log('Proxy response:', proxyRes.statusCode, 'for', req.url);
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
