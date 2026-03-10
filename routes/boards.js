/**
 * Board CRUD REST API + card-board associations.
 * Boards are topic groupings for cards. A card can belong to multiple boards.
 */

const express = require('express');
const { db } = require('../db');
const { boards, cardBoards, cards } = require('../db/schema');
const { eq, desc, and } = require('drizzle-orm');

const router = express.Router();

// ── Validation helpers ────────────────────────────

function validateBoardBody(body, isUpdate = false) {
  const errors = [];

  if (!isUpdate && (body.name === undefined || typeof body.name !== 'string' || !body.name.trim())) {
    errors.push('name is required and must be a non-empty string');
  }
  if (body.name !== undefined && typeof body.name !== 'string') {
    errors.push('name must be a string');
  }
  if (body.description !== undefined && typeof body.description !== 'string') {
    errors.push('description must be a string');
  }

  return errors;
}

// ── POST /api/v1/boards — Create a Board ──────────

router.post('/', async (req, res) => {
  const errors = validateBoardBody(req.body);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const { name, description = '', workspaceId = null } = req.body;

  try {
    const [board] = await db.insert(boards).values({
      name: name.trim(),
      description,
      workspaceId,
    }).returning();

    res.status(201).json(board);
  } catch (err) {
    console.error('Error creating board:', err);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// ── GET /api/v1/boards — List Boards ──────────────

router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const results = await db.select().from(boards)
      .orderBy(desc(boards.updatedAt))
      .limit(limit)
      .offset(offset);

    res.json(results);
  } catch (err) {
    console.error('Error listing boards:', err);
    res.status(500).json({ error: 'Failed to list boards' });
  }
});

// ── GET /api/v1/boards/:id — Get a Board with its cards ─

router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [board] = await db.select().from(boards).where(eq(boards.id, id)).limit(1);

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    // Fetch associated cards
    const associations = await db.select({
      card: cards,
    }).from(cardBoards)
      .innerJoin(cards, eq(cardBoards.cardId, cards.id))
      .where(eq(cardBoards.boardId, id));

    res.json({ ...board, cards: associations.map((a) => a.card) });
  } catch (err) {
    console.error('Error fetching board:', err);
    res.status(500).json({ error: 'Failed to fetch board' });
  }
});

// ── PATCH /api/v1/boards/:id — Update a Board ────

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const errors = validateBoardBody(req.body, true);
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  const updates = {};
  if (req.body.name !== undefined) updates.name = req.body.name.trim();
  if (req.body.description !== undefined) updates.description = req.body.description;
  updates.updatedAt = new Date();

  if (Object.keys(updates).length === 1) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    const [board] = await db.update(boards).set(updates).where(eq(boards.id, id)).returning();

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    res.json(board);
  } catch (err) {
    console.error('Error updating board:', err);
    res.status(500).json({ error: 'Failed to update board' });
  }
});

// ── DELETE /api/v1/boards/:id — Delete a Board ───

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Remove all card-board associations first
    await db.delete(cardBoards).where(eq(cardBoards.boardId, id));

    const [board] = await db.delete(boards).where(eq(boards.id, id)).returning();

    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    res.status(200).json({ message: 'Board deleted', board });
  } catch (err) {
    console.error('Error deleting board:', err);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// ── Card-Board Associations ───────────────────────

// POST /api/v1/boards/:id/cards — Add a card to a board
router.post('/:id/cards', async (req, res) => {
  const { id: boardId } = req.params;
  const { cardId } = req.body;

  if (!cardId) {
    return res.status(400).json({ error: 'cardId is required' });
  }

  try {
    // Check board exists
    const [board] = await db.select().from(boards).where(eq(boards.id, boardId)).limit(1);
    if (!board) {
      return res.status(404).json({ error: 'Board not found' });
    }

    // Check if association already exists
    const existing = await db.select().from(cardBoards)
      .where(and(eq(cardBoards.cardId, cardId), eq(cardBoards.boardId, boardId)))
      .limit(1);

    if (existing.length > 0) {
      return res.status(200).json({ message: 'Card already in board' });
    }

    await db.insert(cardBoards).values({ cardId, boardId });
    res.status(201).json({ message: 'Card added to board' });
  } catch (err) {
    console.error('Error adding card to board:', err);
    res.status(500).json({ error: 'Failed to add card to board' });
  }
});

// DELETE /api/v1/boards/:id/cards/:cardId — Remove a card from a board
router.delete('/:id/cards/:cardId', async (req, res) => {
  const { id: boardId, cardId } = req.params;

  try {
    await db.delete(cardBoards)
      .where(and(eq(cardBoards.cardId, cardId), eq(cardBoards.boardId, boardId)));

    res.status(200).json({ message: 'Card removed from board' });
  } catch (err) {
    console.error('Error removing card from board:', err);
    res.status(500).json({ error: 'Failed to remove card from board' });
  }
});

// GET /api/v1/boards/cards/:cardId/boards — Get boards for a card
router.get('/cards/:cardId/boards', async (req, res) => {
  const { cardId } = req.params;

  try {
    const associations = await db.select({
      board: boards,
    }).from(cardBoards)
      .innerJoin(boards, eq(cardBoards.boardId, boards.id))
      .where(eq(cardBoards.cardId, cardId));

    res.json(associations.map((a) => a.board));
  } catch (err) {
    console.error('Error fetching boards for card:', err);
    res.status(500).json({ error: 'Failed to fetch boards for card' });
  }
});

// PUT /api/v1/boards/cards/:cardId/boards — Set boards for a card (replace all)
router.put('/cards/:cardId/boards', async (req, res) => {
  const { cardId } = req.params;
  const { boardIds } = req.body;

  if (!Array.isArray(boardIds)) {
    return res.status(400).json({ error: 'boardIds must be an array' });
  }

  try {
    // Remove all existing associations
    await db.delete(cardBoards).where(eq(cardBoards.cardId, cardId));

    // Add new associations
    if (boardIds.length > 0) {
      await db.insert(cardBoards).values(
        boardIds.map((boardId) => ({ cardId, boardId }))
      );
    }

    // Return the updated boards list
    const associations = await db.select({
      board: boards,
    }).from(cardBoards)
      .innerJoin(boards, eq(cardBoards.boardId, boards.id))
      .where(eq(cardBoards.cardId, cardId));

    res.json(associations.map((a) => a.board));
  } catch (err) {
    console.error('Error setting boards for card:', err);
    res.status(500).json({ error: 'Failed to set boards for card' });
  }
});

module.exports = router;
