const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { Worker } = require('worker_threads');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

const canvasStore = {}

 const worker = new Worker(path.join(__dirname, 'workers', 'canvasProcessor.js'));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse JSON bodies
app.use(bodyParser.json({ limit: '10mb' }));


// Route for the home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route for the home page
app.get('/canvas', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'canvas.html'));
});

// Route for the home page
app.get('/pen_event', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pen_event.html'));
});

// POST method to save canvas data
app.post('/api/save-canvas', (req, res) => {
  const { canvasData, canvasTitle } = req.body;
  const canvasId = uuidv4();
  canvasStore[canvasId] = {
    "canvasId": canvasId,
    "canvasTitle": canvasTitle,
    "status": "preparing"
  }

  worker.postMessage({ canvasData, canvasId });
  res.json({message: "Processing canvas", canvasId})
});

worker.on('message', (message) => {
  canvasItem = canvasStore[message.canvasId]
  if (message.success) {
    canvasItem.status = "processed"
    canvasItem.filename = message.fileName
    canvasItem.processMessage = message.message
  } else {
    canvasItem.status = "error"
    canvasItem.filename = message.fileName
    canvasItem.processMessage = message.message
    canvasItem.processError = message.error

  }
  
  console.log("Canvas Item", canvasItem)
})

worker.on('error', (error) => {
    console.error('Worker error:', error);
});

worker.on('exit', (code) => {
  if (code !== 0) {
    console.error(`Worker stopped with exit code ${code}`);
  }
});

app.get('/api/list-canvas', (req, res) => {
  res.json(canvasStore)
})

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});