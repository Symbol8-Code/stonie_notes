/**
 * Vercel Serverless Function entry point.
 *
 * Wraps the Express app for deployment as a Vercel serverless function.
 * Uses the inline canvas processor instead of Worker Threads
 * (which are not supported in serverless environments).
 */

const express = require('express');
const { processCanvas } = require('../workers/canvasProcessorInline');

const app = express();

// Middleware
app.use(express.json({ limit: '10mb' }));

// ── v1 API routes ────
const cardsRouter = require('../routes/cards');
const canvasesRouter = require('../routes/canvases');
const boardsRouter = require('../routes/boards');
const extractionsRouter = require('../routes/extractions')(processCanvas);

app.use('/api/v1/cards', cardsRouter);
app.use('/api/v1/canvases', canvasesRouter);
app.use('/api/v1/boards', boardsRouter);
app.use('/api/v1', extractionsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = app;
