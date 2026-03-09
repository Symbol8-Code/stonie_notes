const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const { Worker } = require('worker_threads');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

const canvasStore = {}
const pendingInterpretRequests = new Map(); // requestId -> { resolve, reject }

 const worker = new Worker(path.join(__dirname, 'workers', 'canvasProcessor.js'));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve built React app if it exists (production)
const clientDist = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use('/app', express.static(clientDist));
}

// Middleware to parse JSON bodies
app.use(bodyParser.json({ limit: '10mb' }));

// ── New v1 API routes (DESIGN.md Section 7.5) ────
const cardsRouter = require('./routes/cards');
const canvasesRouter = require('./routes/canvases');
app.use('/api/v1/cards', cardsRouter);
app.use('/api/v1/canvases', canvasesRouter);

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

// POST method to interpret canvas drawing via LLM
app.post('/api/v1/canvases/interpret', (req, res) => {
  const { canvasData } = req.body;
  if (!canvasData) {
    return res.status(400).json({ error: 'canvasData is required' });
  }

  const requestId = uuidv4();
  const timeoutMs = 60000; // 60s timeout for LLM response

  const timeout = setTimeout(() => {
    if (pendingInterpretRequests.has(requestId)) {
      const { reject } = pendingInterpretRequests.get(requestId);
      pendingInterpretRequests.delete(requestId);
      reject(new Error('Interpretation timed out'));
    }
  }, timeoutMs);

  const promise = new Promise((resolve, reject) => {
    pendingInterpretRequests.set(requestId, { resolve, reject });
  });

  worker.postMessage({ canvasData, canvasId: requestId, requestId });

  promise
    .then((jsonData) => {
      clearTimeout(timeout);
      res.json(jsonData);
    })
    .catch((err) => {
      clearTimeout(timeout);
      res.status(500).json({ error: err.message || 'Interpretation failed' });
    });
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
  // Handle interpret requests (request-response via correlation ID)
  if (message.requestId && pendingInterpretRequests.has(message.requestId)) {
    const { resolve, reject } = pendingInterpretRequests.get(message.requestId);
    pendingInterpretRequests.delete(message.requestId);
    if (message.success) {
      resolve(message.jsonData);
    } else {
      reject(new Error(message.message || 'Interpretation failed'));
    }
    return;
  }

  // Handle legacy canvas save requests
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