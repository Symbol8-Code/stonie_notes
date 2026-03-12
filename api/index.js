/**
 * Vercel Serverless Function entry point.
 *
 * Wraps the Express app for deployment as a Vercel serverless function.
 * Uses the inline canvas processor instead of Worker Threads
 * (which are not supported in serverless environments).
 */

const express = require('express');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');
const { aiExtractions } = require('../db/schema');
const { eq, desc, like, and } = require('drizzle-orm');
const { processCanvas } = require('../workers/canvasProcessorInline');

const app = express();

// Middleware
app.use(bodyParser.json({ limit: '10mb' }));

// ── v1 API routes ────
const cardsRouter = require('../routes/cards');
const canvasesRouter = require('../routes/canvases');
const boardsRouter = require('../routes/boards');
app.use('/api/v1/cards', cardsRouter);
app.use('/api/v1/canvases', canvasesRouter);
app.use('/api/v1/boards', boardsRouter);

// GET extractions for a given source
app.get('/api/v1/extractions', async (req, res) => {
  const { sourceId, prefix, extractionType: typeFilter } = req.query;
  if (!sourceId) {
    return res.status(400).json({ error: 'sourceId query parameter is required' });
  }

  try {
    const conditions = [
      prefix
        ? like(aiExtractions.sourceId, `${sourceId}:%`)
        : eq(aiExtractions.sourceId, sourceId),
    ];
    if (typeFilter) {
      conditions.push(eq(aiExtractions.extractionType, typeFilter));
    }

    const results = await db.select().from(aiExtractions)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(desc(aiExtractions.createdAt));

    res.json(results);
  } catch (err) {
    console.error('Error fetching extractions:', err);
    res.status(500).json({ error: 'Failed to fetch extractions' });
  }
});

// POST interpret canvas drawing via LLM (serverless-compatible, no Worker Threads)
app.post('/api/v1/canvases/interpret', async (req, res) => {
  const { canvasData, cardId, mode, blockId } = req.body;
  if (!canvasData) {
    return res.status(400).json({ error: 'canvasData is required' });
  }

  try {
    const jsonData = await processCanvas({ canvasData, mode });
    const sourceId = cardId && blockId ? `${cardId}:${blockId}` : (cardId || uuidv4());

    try {
      const [extraction] = await db.insert(aiExtractions).values({
        sourceType: 'canvas',
        sourceId,
        extractionType: 'items',
        result: jsonData,
        confidence: null,
      }).returning();

      res.json({ ...jsonData, extractionId: extraction.id });
    } catch (dbErr) {
      console.error('Error saving extraction to DB:', dbErr);
      res.json({ ...jsonData, saveError: 'Failed to save interpretation to database' });
    }
  } catch (err) {
    console.error('Canvas interpretation error:', err);
    res.status(500).json({ error: err.message || 'Interpretation failed' });
  }
});

// POST meeting notes via LLM (serverless-compatible)
app.post('/api/v1/cards/meeting-notes', async (req, res) => {
  const { canvasData, textContent, cardId } = req.body;
  if (!canvasData && !textContent) {
    return res.status(400).json({ error: 'canvasData or textContent is required' });
  }

  try {
    const jsonData = await processCanvas({
      canvasData: canvasData || '',
      textContent,
      mode: 'meetingNotes',
    });
    const sourceId = cardId || uuidv4();

    try {
      const [extraction] = await db.insert(aiExtractions).values({
        sourceType: 'canvas',
        sourceId,
        extractionType: 'meeting_notes',
        result: jsonData,
        confidence: null,
      }).returning();

      res.json({ ...jsonData, extractionId: extraction.id });
    } catch (dbErr) {
      console.error('Error saving meeting notes to DB:', dbErr);
      res.json({ ...jsonData, saveError: 'Failed to save meeting notes to database' });
    }
  } catch (err) {
    console.error('Meeting notes extraction error:', err);
    res.status(500).json({ error: err.message || 'Meeting notes extraction failed' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = app;
