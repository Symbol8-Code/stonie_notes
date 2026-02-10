/**
 * Database schema for STonIE Notes.
 * See DESIGN.md Section 7.4 (Database Schema).
 *
 * Uses Drizzle ORM with PostgreSQL.
 */

const { pgTable, uuid, text, timestamp, integer, real, pgEnum, jsonb } = require('drizzle-orm/pg-core');

// ── Enums ─────────────────────────────────────────

const cardSourceEnum = pgEnum('card_source', [
  'pen', 'keyboard', 'photo', 'voice', 'ai_extracted', 'integration',
]);

const cardStatusEnum = pgEnum('card_status', [
  'open', 'in_progress', 'done', 'archived',
]);

const boardTypeEnum = pgEnum('board_type', [
  'kanban', 'list', 'timeline', 'custom',
]);

const strokeToolEnum = pgEnum('stroke_tool', [
  'pen', 'highlighter', 'eraser',
]);

const linkTypeEnum = pgEnum('link_type', [
  'related', 'blocks', 'blocked_by', 'parent', 'child', 'duplicate',
]);

const integrationProviderEnum = pgEnum('integration_provider', [
  'github', 'claude_code', 'calendar', 'slack', 'webhook',
]);

const syncModeEnum = pgEnum('sync_mode', [
  'mirror', 'push', 'pull', 'manual',
]);

const extractionTypeEnum = pgEnum('extraction_type', [
  'text', 'items', 'relationships', 'action_items', 'tags',
]);

const extractionSourceEnum = pgEnum('extraction_source', [
  'canvas', 'photo', 'voice',
]);

// ── Tables ────────────────────────────────────────

const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique().notNull(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  ownerId: uuid('owner_id').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

const workspaceMembers = pgTable('workspace_members', {
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  userId: uuid('user_id').references(() => users.id).notNull(),
  role: text('role').notNull().default('editor'),
});

const boards = pgTable('boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id).notNull(),
  name: text('name').notNull(),
  boardType: boardTypeEnum('board_type').notNull().default('kanban'),
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

const lanes = pgTable('lanes', {
  id: uuid('id').primaryKey().defaultRandom(),
  boardId: uuid('board_id').references(() => boards.id).notNull(),
  name: text('name').notNull(),
  position: integer('position').notNull().default(0),
  color: text('color'),
});

const cards = pgTable('cards', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  title: text('title').notNull().default(''),
  bodyText: text('body_text').notNull().default(''),
  source: cardSourceEnum('source').notNull().default('keyboard'),
  status: cardStatusEnum('status').notNull().default('open'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

const cardBoardPlacements = pgTable('card_board_placements', {
  cardId: uuid('card_id').references(() => cards.id).notNull(),
  laneId: uuid('lane_id').references(() => lanes.id).notNull(),
  position: integer('position').notNull().default(0),
});

const cardCanvasPlacements = pgTable('card_canvas_placements', {
  cardId: uuid('card_id').references(() => cards.id).notNull(),
  canvasId: uuid('canvas_id').references(() => canvases.id).notNull(),
  x: real('x').notNull().default(0),
  y: real('y').notNull().default(0),
  width: real('width').notNull().default(200),
  height: real('height').notNull().default(100),
});

const canvases = pgTable('canvases', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  name: text('name').notNull().default('Untitled Canvas'),
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

const strokes = pgTable('strokes', {
  id: uuid('id').primaryKey().defaultRandom(),
  canvasId: uuid('canvas_id').references(() => canvases.id).notNull(),
  userId: uuid('user_id').references(() => users.id),
  strokeData: jsonb('stroke_data').notNull(),
  color: text('color').notNull().default('#000000'),
  width: real('width').notNull().default(2),
  tool: strokeToolEnum('tool').notNull().default('pen'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

const photos = pgTable('photos', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id').references(() => cards.id).notNull(),
  storageUrl: text('storage_url').notNull(),
  ocrText: text('ocr_text'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

const voiceMemos = pgTable('voice_memos', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id').references(() => cards.id).notNull(),
  storageUrl: text('storage_url').notNull(),
  transcript: text('transcript'),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

const cardLinks = pgTable('card_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceCardId: uuid('source_card_id').references(() => cards.id).notNull(),
  targetCardId: uuid('target_card_id').references(() => cards.id).notNull(),
  linkType: linkTypeEnum('link_type').notNull().default('related'),
});

const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  name: text('name').notNull(),
  path: text('path').notNull(),
  color: text('color'),
});

const cardTags = pgTable('card_tags', {
  cardId: uuid('card_id').references(() => cards.id).notNull(),
  tagId: uuid('tag_id').references(() => tags.id).notNull(),
});

const integrationLinks = pgTable('integration_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  cardId: uuid('card_id').references(() => cards.id).notNull(),
  provider: integrationProviderEnum('provider').notNull(),
  externalId: text('external_id'),
  externalUrl: text('external_url'),
  syncMode: syncModeEnum('sync_mode').notNull().default('manual'),
  syncState: jsonb('sync_state'),
  lastSyncedAt: timestamp('last_synced_at'),
});

const aiExtractions = pgTable('ai_extractions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceType: extractionSourceEnum('source_type').notNull(),
  sourceId: uuid('source_id').notNull(),
  extractionType: extractionTypeEnum('extraction_type').notNull(),
  result: jsonb('result').notNull(),
  confidence: real('confidence'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

module.exports = {
  // Enums
  cardSourceEnum,
  cardStatusEnum,
  boardTypeEnum,
  strokeToolEnum,
  linkTypeEnum,
  integrationProviderEnum,
  syncModeEnum,
  extractionTypeEnum,
  extractionSourceEnum,
  // Tables
  users,
  workspaces,
  workspaceMembers,
  boards,
  lanes,
  cards,
  cardBoardPlacements,
  cardCanvasPlacements,
  canvases,
  strokes,
  photos,
  voiceMemos,
  cardLinks,
  tags,
  cardTags,
  integrationLinks,
  aiExtractions,
};
