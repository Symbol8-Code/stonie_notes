/**
 * Canvas CRUD REST API.
 * See DESIGN.md Section 7.5 (API Design) and Section 4.3 (Canvases).
 */

const express = require('express');
const { db } = require('../db');
const { canvases, strokes } = require('../db/schema');
const { eq, desc } = require('drizzle-orm');

const router = express.Router();

// ── POST /api/v1/canvases — Create a Canvas ──────

router.post('/', async (req, res) => {
  const { name = 'Untitled Canvas', workspaceId = null } = req.body;

  if (typeof name !== 'string') {
    return res.status(400).json({ error: 'name must be a string' });
  }

  try {
    const [canvas] = await db.insert(canvases).values({
      name,
      workspaceId,
    }).returning();

    res.status(201).json(canvas);
  } catch (err) {
    console.error('Error creating canvas:', err);
    res.status(500).json({ error: 'Failed to create canvas' });
  }
});

// ── GET /api/v1/canvases — List Canvases ──────────

router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const results = await db.select().from(canvases)
      .orderBy(desc(canvases.createdAt))
      .limit(limit)
      .offset(offset);

    res.json(results);
  } catch (err) {
    console.error('Error listing canvases:', err);
    res.status(500).json({ error: 'Failed to list canvases' });
  }
});

// ── GET /api/v1/canvases/:id — Get Canvas with strokes ─

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [canvas] = await db.select().from(canvases).where(eq(canvases.id, id)).limit(1);

    if (!canvas) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    const canvasStrokes = await db.select().from(strokes)
      .where(eq(strokes.canvasId, id))
      .orderBy(strokes.createdAt);

    res.json({ ...canvas, strokes: canvasStrokes });
  } catch (err) {
    console.error('Error fetching canvas:', err);
    res.status(500).json({ error: 'Failed to fetch canvas' });
  }
});

// ── POST /api/v1/canvases/:id/strokes — Submit strokes ─

router.post('/:id/strokes', async (req, res) => {
  const { id } = req.params;
  const { strokeData, color = '#000000', width = 2, tool = 'pen' } = req.body;

  if (!strokeData || !Array.isArray(strokeData)) {
    return res.status(400).json({ error: 'strokeData must be an array of points' });
  }

  if (!['pen', 'highlighter', 'eraser'].includes(tool)) {
    return res.status(400).json({ error: 'tool must be pen, highlighter, or eraser' });
  }

  try {
    // Verify canvas exists
    const [canvas] = await db.select().from(canvases).where(eq(canvases.id, id)).limit(1);
    if (!canvas) {
      return res.status(404).json({ error: 'Canvas not found' });
    }

    const [stroke] = await db.insert(strokes).values({
      canvasId: id,
      strokeData,
      color,
      width,
      tool,
    }).returning();

    res.status(201).json(stroke);
  } catch (err) {
    console.error('Error saving stroke:', err);
    res.status(500).json({ error: 'Failed to save stroke' });
  }
});

module.exports = router;
