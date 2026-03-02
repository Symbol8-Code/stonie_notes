/**
 * Card CRUD REST API.
 * See DESIGN.md Section 7.5 (API Design) and Section 2.2 (Everything is a Card).
 */

const express = require('express');
const { db } = require('../db');
const { cards } = require('../db/schema');
const { eq, desc, sql } = require('drizzle-orm');

const router = express.Router();

const VALID_SOURCES = ['pen', 'keyboard', 'photo', 'voice', 'ai_extracted', 'integration'];
const VALID_STATUSES = ['open', 'in_progress', 'done', 'archived'];

// ── Validation helpers ────────────────────────────

function validateCardBody(body, isUpdate = false) {
  const errors = [];

  if (!isUpdate && body.title !== undefined && typeof body.title !== 'string') {
    errors.push('title must be a string');
  }
  if (body.bodyText !== undefined && typeof body.bodyText !== 'string') {
    errors.push('bodyText must be a string');
  }
  if (body.source !== undefined && !VALID_SOURCES.includes(body.source)) {
    errors.push(`source must be one of: ${VALID_SOURCES.join(', ')}`);
  }
  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  return errors;
}

// ── POST /api/v1/cards — Create a Card ────────────

router.post('/', async (req, res) => {
  const errors = validateCardBody(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const { title = '', bodyText = '', source = 'keyboard', status = 'open', workspaceId = null } = req.body;

  try {
    const [card] = await db.insert(cards).values({
      title,
      bodyText,
      source,
      status,
      workspaceId,
    }).returning();

    res.status(201).json(card);
  } catch (err) {
    console.error('Error creating card:', err);
    res.status(500).json({ error: 'Failed to create card' });
  }
});

// ── GET /api/v1/cards — List Cards with pagination ─

router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  const status = req.query.status;

  try {
    let query = db.select().from(cards).orderBy(desc(cards.updatedAt)).limit(limit).offset(offset);

    if (status && VALID_STATUSES.includes(status)) {
      query = db.select().from(cards).where(eq(cards.status, status)).orderBy(desc(cards.updatedAt)).limit(limit).offset(offset);
    }

    const results = await query;
    res.json(results);
  } catch (err) {
    console.error('Error listing cards:', err);
    res.status(500).json({ error: 'Failed to list cards' });
  }
});

// ── GET /api/v1/cards/search — Full-text search ───

router.get('/search', async (req, res) => {
  const q = req.query.q;
  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    return res.status(400).json({ error: 'Query parameter q is required' });
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const searchTerm = `%${q.trim()}%`;

  try {
    const results = await db.select().from(cards)
      .where(
        sql`(${cards.title} ILIKE ${searchTerm} OR ${cards.bodyText} ILIKE ${searchTerm})`
      )
      .orderBy(desc(cards.updatedAt))
      .limit(limit);

    res.json(results);
  } catch (err) {
    console.error('Error searching cards:', err);
    res.status(500).json({ error: 'Failed to search cards' });
  }
});

// ── GET /api/v1/cards/:id — Get a Card ────────────

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [card] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json(card);
  } catch (err) {
    console.error('Error fetching card:', err);
    res.status(500).json({ error: 'Failed to fetch card' });
  }
});

// ── PATCH /api/v1/cards/:id — Update a Card ───────

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const errors = validateCardBody(req.body, true);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  // Only allow updating known fields
  const updates = {};
  if (req.body.title !== undefined) updates.title = req.body.title;
  if (req.body.bodyText !== undefined) updates.bodyText = req.body.bodyText;
  if (req.body.source !== undefined) updates.source = req.body.source;
  if (req.body.status !== undefined) updates.status = req.body.status;
  updates.updatedAt = new Date();

  if (Object.keys(updates).length === 1) {
    // Only updatedAt, nothing to change
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    const [card] = await db.update(cards).set(updates).where(eq(cards.id, id)).returning();

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json(card);
  } catch (err) {
    console.error('Error updating card:', err);
    res.status(500).json({ error: 'Failed to update card' });
  }
});

// ── DELETE /api/v1/cards/:id — Archive (soft delete) ─

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [card] = await db.update(cards)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(cards.id, id))
      .returning();

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.status(200).json({ message: 'Card archived', card });
  } catch (err) {
    console.error('Error archiving card:', err);
    res.status(500).json({ error: 'Failed to archive card' });
  }
});

module.exports = router;
