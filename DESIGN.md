# STonIE Notes - Unified Notes & Workspace App Design Document

## 1. Vision

STonIE Notes evolves from a canvas-to-structured-data prototype into a **unified workspace** that replaces the fragmented toolset of Trello, Google Keep, and OneNote with a single, AI-powered application that adapts to however you work. The core thesis: the best input mode depends on context — typing on your phone while in line, scribbling with a pen during a meeting, keyboard shortcuts on your laptop — and the app should treat all of them as first-class citizens. AI does the heavy lifting of organizing, linking, and interpreting input from any source into actionable structured data.

**One-line pitch**: An input-adaptive workspace where typed notes, scribbled ideas, photos, and voice all flow into the same searchable, connected system — use whatever input fits the moment, on every device.

### 1.1 Problems with the Current Multi-Tool Workflow

| Tool | Strengths | Pain Points |
|------|-----------|-------------|
| **Trello** | Shared boards, real-time sync, accessible everywhere | Keyboard-only, no pen input, rigid board/list/card structure |
| **Google Keep** | Quick capture on phone, accessible anywhere | Photos and notes are disconnected, no annotation on photos, no deep organization |
| **OneNote** | Freeform pen scribbling, spatial layout | Poor cross-device sync, handwriting not searchable, notes scattered and unlinked, ideas fragmented across pages |

**Cross-tool problems:**
- Context scattered across three apps with no cross-referencing
- Switching between tools breaks flow
- Each tool only excels at one input mode — Trello is keyboard-only, OneNote is pen-only, Keep is phone-typing-only. No single tool handles all input modes well.
- No integration with developer workflows (GitHub, CI/CD, Claude Code)
- Handwritten content is a dead end — never converted to structured, searchable, actionable data

### 1.2 Success Criteria

1. A user can scribble a meeting note on a tablet, and within seconds it becomes searchable text with extracted action items
2. A user can type a quick note on their phone while walking, and it lands in the same workspace as their tablet sketches
3. A user can sketch a workflow diagram, and the system extracts tasks and creates trackable items
4. Shared boards update in real-time across family members / team members on any device
5. Photo annotations directly overlay text and drawings on images
6. A developer can link notes to GitHub issues, trigger Claude Code sessions, and track release milestones — all from the same workspace
7. Switching between pen, keyboard, voice, and camera within a single note or card feels seamless — not a mode change, just a different way to add content
8. The app adapts its UI to the active input method and device, surfacing the right tools without requiring manual configuration

---

## 2. Core Concepts & Information Architecture

### 2.1 The Object Model

```
Workspace
  |
  +-- Board (shared or personal, real-time collaborative)
  |     |
  |     +-- Lane (column / status grouping)
  |           |
  |           +-- Card (the atomic unit of work / information)
  |
  +-- Canvas (infinite spatial surface for freeform content)
  |     |
  |     +-- Stroke (pen/stylus ink data)
  |     +-- Region (AI-detected bounded area within canvas)
  |     +-- Embedded Card (a Card placed spatially on the canvas)
  |
  +-- Note (quick-capture, Google Keep-style)
  |     |
  |     +-- Text Block
  |     +-- Photo (with annotation layer)
  |     +-- Voice Memo (with transcription)
  |     +-- Checklist
  |
  +-- Integration Link (connection to external system)
```

### 2.2 Key Concept: Everything is a Card

The **Card** is the universal atomic unit. Whether created by typing, scribbling, photo capture, or AI extraction — all content normalizes to a Card with:

| Field | Description |
|-------|-------------|
| `id` | Globally unique identifier |
| `title` | Short title (can be AI-generated from handwriting) |
| `body` | Rich content: text, ink strokes, images, checklists |
| `source` | Origin: `pen`, `keyboard`, `photo`, `voice`, `ai-extracted`, `integration` |
| `tags` | User-defined and AI-suggested labels |
| `links` | References to other Cards, external URLs, integration objects |
| `board_placement` | Which Board/Lane this Card lives in (optional) |
| `canvas_placement` | Spatial position on a Canvas (optional) |
| `created_at` | Timestamp |
| `updated_at` | Timestamp |
| `created_by` | User who created it |
| `collaborators` | Users with access |
| `status` | `open`, `in_progress`, `done`, `archived` |
| `ai_metadata` | Extracted text, detected relationships, confidence scores |

A single Card can simultaneously exist on a Board (as a task) and on a Canvas (spatially positioned alongside related sketches). This dual-placement model eliminates the fragmentation problem — a scribbled idea on a Canvas and a task on a Board can be the same object.

### 2.3 Key Concept: Canvases are Intelligent

Canvases extend the existing STonIE prototype. When a user draws on a Canvas, the system:

1. **Captures** raw stroke data (points, pressure, tilt) — not just a flat image
2. **Recognizes** handwriting in near-real-time, producing searchable text shadow
3. **Detects regions** — bounded areas that represent distinct ideas, items, or diagrams
4. **Extracts structure** — items and relationships (as the current prototype does)
5. **Generates Cards** — each detected region can become a Card, automatically linked to sibling regions on the same Canvas
6. **Preserves the original** — ink strokes are always preserved; the structured interpretation is a layer on top, never a replacement

### 2.4 Key Concept: Photos are Annotatable Canvases

When a user captures or imports a photo:
- The photo becomes the **background layer** of a mini-Canvas
- The user can draw directly on the photo (pen annotations, arrows, circles, text callouts)
- AI analyzes both the photo content and the annotations together
- Annotations are stored as stroke data, not baked into the image
- Each annotation region can link to or become a Card

This directly solves the Google Keep limitation where photos and notes are disconnected.

---

## 3. Device & Input Strategy

### 3.1 Multi-Modal Input Philosophy

The right input mode depends entirely on context — not on the app's preference. STonIE treats **every input mode as a first-class citizen** and adapts its interface to match what the user is doing right now.

**Principle: The app follows the user's input, not the other way around.**

When a user picks up a stylus, pen tools surface automatically. When they tap a text field or open a keyboard, typing tools appear. When they long-press a photo, annotation options emerge. There is no "pen mode" vs. "keyboard mode" — the app detects the active input and adapts in real time.

| Input Mode | When it Shines | Example Scenario |
|------------|---------------|------------------|
| **Keyboard (physical)** | Structured writing, detailed edits, search, board management | At a desk writing up meeting notes after the fact, managing a sprint board, composing detailed card descriptions |
| **Keyboard (on-screen)** | Quick text capture on mobile, checklists, short updates | On a bus adding items to a grocery list, replying to a card comment, quick thought dump |
| **Pen / Stylus** | Visual thinking, meeting sketches, diagrams, spatial layout, annotations | In a meeting scribbling architecture ideas, annotating a screenshot, sketching a UI wireframe |
| **Camera + Annotation** | Capturing physical artifacts with context | Photographing a whiteboard and circling key items, snapping a product label and adding notes |
| **Voice** | Hands-busy capture, long-form dictation | Driving and capturing a thought, dictating meeting minutes while hands are on the keyboard |
| **Finger drawing** | Lightweight sketching on phone, quick highlights | Circling something in a photo, rough diagram on the go |

### 3.2 Device Matrix

Each device has natural strengths. The app optimizes for these rather than forcing a single interaction model.

| Device | Natural Inputs | Optimized Experience |
|--------|---------------|---------------------|
| **Phone** | On-screen keyboard, camera, voice, finger | Fast text capture and checklists via keyboard. Camera for photos with finger annotation. Voice memos. Feed-style card browsing. Compact quick-capture widget. |
| **Tablet + Pen** | Stylus, on-screen keyboard, camera | Full Canvas experience for pen scribbling and diagramming. Keyboard available for text blocks, search, and card details. Split-screen for Canvas + Board side-by-side. |
| **Tablet (no pen)** | On-screen keyboard, finger, camera | Board management, card editing, finger-based canvas sketching with larger touch targets. |
| **Computer** | Physical keyboard, mouse/trackpad | Keyboard-driven workflows: board management, detailed editing, search, integrations config. Multi-pane layout. Full keyboard shortcut set. Canvas interaction via mouse for positioning and layout. |

### 3.3 Seamless Input Switching

A single Card or Canvas can contain content from multiple input modes, created at different times:

```
Card: "Sprint 14 Planning"
  |
  +-- [keyboard] Typed title and description
  +-- [pen] Hand-drawn architecture sketch added during meeting
  +-- [photo] Whiteboard photo snapped after meeting
  +-- [pen] Annotations drawn on the whiteboard photo
  +-- [keyboard] Action items typed up afterward at desk
  +-- [voice] Voice memo appended while walking to next meeting
```

All of this lives in one Card. The system renders each content block with its native fidelity (ink strokes stay as strokes, typed text stays as text, photos stay as images) while the AI layer unifies them into a single searchable, structured representation.

### 3.4 Pen Input Architecture

Pen input requires richer data capture than keyboard or touch. The system captures:

| Data Point | Purpose |
|------------|---------|
| `x, y` coordinates | Spatial position |
| `pressure` | Line weight and emphasis detection |
| `tiltX, tiltY` | Brush angle effects, distinguishing writing from shading |
| `timestamp` | Stroke speed for handwriting recognition models |
| `pointerType` | Distinguish pen, finger, eraser |

**Pen Interaction Modes** (switchable via toolbar or gesture):

| Mode | Behavior |
|------|----------|
| **Write** | Freeform ink — handwriting recognized in background |
| **Draw** | Freeform ink — shape detection (lines, arrows, boxes, circles) |
| **Select** | Lasso selection of regions, Cards, or ink strokes |
| **Erase** | Stroke-level or region-level erasing |
| **Annotate** | Ink overlaid on photos or existing content |
| **Command** | Gesture-based shortcuts (e.g., circle an item and flick right to move to "Done" lane) |

### 3.5 Keyboard Input Architecture

Keyboard input is equally critical and gets dedicated design attention:

**Rich text editing**: Cards support Markdown-style formatting via keyboard shortcuts (bold, headers, lists, code blocks). No mouse required for common formatting.

**Keyboard shortcuts** (computer and external keyboards on tablets):

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + N` | New Card (opens in typing mode) |
| `Ctrl/Cmd + Shift + N` | New Canvas |
| `Ctrl/Cmd + K` | Quick search / command palette |
| `Ctrl/Cmd + Enter` | Save and close Card |
| `Tab` / `Shift+Tab` | Indent / outdent in checklists |
| `/` in a Card body | Slash commands (e.g., `/checklist`, `/photo`, `/voice`, `/tag`) |
| Arrow keys on Boards | Navigate between Cards and Lanes |
| `Enter` on a Board Lane | Quick-add Card by typing |

**Slash commands**: Typing `/` in a Card body opens an inline command palette — similar to Notion or Slack. This lets keyboard users access every feature without reaching for a mouse:
- `/checklist` — insert a checklist
- `/photo` — attach a photo
- `/canvas` — embed a mini-canvas for quick sketching
- `/link [card-name]` — link to another Card
- `/tag [tag-name]` — add a tag
- `/github [repo/issue]` — link to a GitHub issue
- `/due [date]` — set a due date

**Phone keyboard optimizations**:
- Auto-expanding text area (no tiny fixed input boxes)
- Smart suggestions bar above the keyboard (recent tags, common actions)
- Swipe gestures on cards in list view (swipe right = done, swipe left = archive)
- Quick-entry mode: open app -> start typing immediately, Card created on first keystroke

### 3.6 Responsive Layout

The UI adapts, not just scales:

**Tablet (landscape)**: Full Canvas or Board view with collapsible sidebar for navigation and tools. Pen toolbar docked to the edge of the active hand (left or right, configurable).

**Tablet (portrait)**: Stacked view — Canvas/Board on top, card detail or note list on bottom. Half-screen split for multitasking.

**Phone (portrait)**: Single-pane navigation. Quick-capture button always accessible. Cards displayed as a feed. Canvas available but optimized for finger input (larger targets, simplified tools).

**Computer (widescreen)**: Multi-pane layout. Board/Canvas as the main area with a persistent sidebar for navigation, search, and integrations. Keyboard shortcuts for power users.

---

## 4. Feature Design

### 4.1 Quick Capture (replaces Google Keep)

**Goal**: Zero-friction idea capture from any device in under 3 seconds.

**Entry points** (each device gets the fastest path for its natural input):
- **Phone**: Persistent floating action button (FAB) or notification shade shortcut. Opens directly into typing mode with keyboard raised. Camera shortcut in the FAB menu for photo capture.
- **Tablet with pen**: Pull from screen edge with pen to open a quick scribble surface. Or tap the FAB to open a keyboard-ready text card.
- **Tablet without pen**: FAB opens into keyboard-ready text card. Long-press FAB for photo or voice options.
- **Computer**: Global keyboard shortcut (`Ctrl/Cmd + Shift + S`) opens a capture popup — cursor is already in the text field. Type immediately. Or use system tray icon for mouse-driven access.
- **All devices**: Share sheet / share intent integration (share links, images, text from other apps)

**Capture types**:
| Type | Input | AI Processing |
|------|-------|---------------|
| Text note | Keyboard | Auto-tag, suggest board placement |
| Handwritten note | Pen | Handwriting recognition, text extraction, auto-tag |
| Photo + annotation | Camera + pen/finger | OCR on photo, interpret annotations, link annotations to content |
| Voice memo | Microphone | Transcription, summarization, action item extraction |
| Checklist | Keyboard or pen | Item extraction from handwritten lists |
| Web clip | Share from browser | Extract title, summary, key content |

**Quick Capture flow**:
```
Trigger capture -> Select type (or auto-detect) -> Input content
     -> AI processes in background -> Card created in Inbox
     -> User can later triage: assign to Board, place on Canvas, tag, or leave in Inbox
```

### 4.2 Boards (replaces Trello)

**Goal**: Shared, real-time collaborative task boards for managing workflows.

**Board types**:
- **Kanban** — lanes represent status (e.g., To Do | In Progress | Done)
- **List** — simple ordered list per lane (e.g., grocery categories)
- **Timeline** — lanes represent time periods or milestones
- **Custom** — user-defined lane semantics

**Key capabilities**:
- Real-time sync across all collaborators (operational transform or CRDT-based)
- Drag-and-drop Cards between lanes (touch, pen, or mouse)
- Cards can be created by any input: type a title, scribble a title, or voice-dictate one
- Filtering and sorting by tags, assignee, due date, source
- Board-level permissions: owner, editor, viewer
- Board templates for common workflows (e.g., "Family Grocery", "Sprint Board", "Release Checklist")

**Keyboard interaction on Boards**:
- Press `Enter` on a Lane header to add a Card — start typing the title immediately
- Arrow keys to navigate between Cards and Lanes
- `Ctrl/Cmd + D` to mark focused Card as done
- `/` in a Card to open slash command palette for rich content
- Drag-and-drop via mouse on desktop; long-press and drag on touch devices

**Pen interaction on Boards**:
- Scribble in the "add card" area of a lane to create a Card from handwriting
- Draw an arrow between two Cards to create a link/dependency
- Circle a Card and drag to move it between lanes
- Cross out a Card (strikethrough gesture) to mark as done

### 4.3 Canvases (replaces OneNote, extends current prototype)

**Goal**: Infinite spatial surface for freeform thinking, with AI-powered structure extraction.

**Canvas features**:
- Infinite pan/zoom surface
- **Mixed content on the same surface**: ink strokes, typed text blocks, images, embedded Cards, shapes — users switch freely between pen and keyboard without changing modes
- Layers: background, ink, text, annotations, AI overlay (bounding boxes, labels)
- Sections/pages for organization within a Canvas (like OneNote sections)
- **Typed text blocks**: Double-tap or double-click anywhere on the Canvas to place a text cursor and start typing. Text blocks are positioned spatially like ink but rendered as crisp, editable, searchable text. Ideal for labeling diagrams, adding structured notes alongside sketches, or working on a computer without a pen.
- **Mixed-input workflows**: Sketch a diagram with pen, then add typed labels and descriptions. Or type an outline on a laptop, then annotate it with pen on a tablet later. Both inputs coexist naturally on the same Canvas.
- AI processing pipeline (extended from current prototype):
  1. Real-time handwriting recognition (streaming, not batch)
  2. Region detection and segmentation
  3. Relationship extraction between regions
  4. Auto-generation of Cards from detected regions
  5. Searchable text index of all content (handwritten and typed)

**Canvas-to-Board bridge**:
- Select a region on a Canvas -> "Send to Board" -> becomes a Card on a specified Board/Lane
- A Card on a Board can reference its source Canvas region (bidirectional link)
- AI can suggest: "This looks like a task list. Create a Board from these items?"

### 4.4 Search & Organization

**Goal**: Everything is findable, including handwritten content.

**Search indexes**:
- Full-text on typed content
- Full-text on AI-recognized handwriting
- Full-text on photo OCR
- Full-text on voice transcriptions
- Tags and metadata
- Integration data (GitHub issue titles, PR descriptions, etc.)

**Organization tools**:
- **Tags**: User-defined and AI-suggested. Hierarchical (e.g., `work/project-alpha`, `family/groceries`)
- **Workspaces**: Top-level containers for separating contexts (e.g., "Personal", "Work", "Family")
- **Inbox**: Default landing zone for quick-captured items awaiting triage
- **Smart Views**: Saved filters (e.g., "All open tasks assigned to me", "Notes from this week with tag 'meeting'")
- **Timeline View**: Chronological view of all Cards and notes, filterable by source, tag, or workspace

### 4.5 Photo Annotation (solves Google Keep limitation)

**Goal**: Photos and notes are a single unified object, not separate items awkwardly grouped.

**Annotation tools** (available when viewing any photo):
- Pen drawing overlay (freeform ink on photo)
- Arrow and pointer tool
- Text callout boxes (positioned spatially on the photo)
- Region highlight (translucent color overlay)
- Crop and zoom

**AI processing on annotated photos**:
- OCR on text visible in the photo
- Object detection and labeling
- Interpretation of annotations (e.g., an arrow pointing to something with a handwritten label)
- Combined understanding: "The user circled this area and wrote 'fix this' — generate a Card with the circled region as thumbnail and 'fix this' as the title"

### 4.6 Real-Time Collaboration

**Goal**: Multiple people can work on the same Board or Canvas simultaneously, like Trello but across all content types.

**Collaboration features**:
- Real-time cursor / pen position for other collaborators
- Live ink rendering (see strokes as they are drawn by others)
- Card-level locking during edit (optimistic, with conflict resolution)
- Activity feed per Board/Canvas
- Presence indicators (who is viewing what)
- Comments on any Card
- @mentions that generate notifications
- Sharing via link, email, or in-app invitation

**Conflict resolution strategy**: CRDT (Conflict-free Replicated Data Types) for real-time ink and text. For structured Card fields, last-writer-wins with full edit history and the ability to revert.

---

## 5. Integration Architecture

### 5.1 Integration Framework

Integrations are modeled as **bidirectional sync channels** between STonIE Cards and external system objects.

```
+-------------------+          +--------------------+          +-------------------+
|   STonIE Card     | <------> |  Integration Link  | <------> | External Object   |
|                   |          |  (sync state,      |          | (GitHub Issue,     |
|  - title          |          |   mapping rules,   |          |  Jira Ticket,     |
|  - body           |          |   last_sync_at)    |          |  etc.)            |
|  - status         |          +--------------------+          +-------------------+
|  - tags           |
+-------------------+
```

**Sync modes**:
- **Mirror**: Changes in either direction are reflected automatically
- **Push**: STonIE is the source of truth, pushes to external
- **Pull**: External is the source of truth, pulls into STonIE
- **Manual**: User triggers sync explicitly

### 5.2 GitHub Integration

| Feature | Description |
|---------|-------------|
| **Issue sync** | STonIE Card <-> GitHub Issue. Status maps to open/closed. Labels map to tags. |
| **PR tracking** | Cards auto-created for PRs linked to synced issues. Status updates as PR progresses. |
| **Commit references** | Mention a Card ID in a commit message; the Card shows the commit history. |
| **Repository board** | Auto-generate a Board from a GitHub repo's issues and milestones. |
| **Webhook-driven** | GitHub webhooks update STonIE in real-time; STonIE API calls update GitHub. |

**Workflow example**: Scribble a bug description on a Canvas during a meeting -> AI extracts it as a Card -> User taps "Push to GitHub" -> GitHub Issue created with the recognized text, linked back to the Canvas for visual context.

### 5.3 Claude Code Integration

| Feature | Description |
|---------|-------------|
| **Session linking** | Link a STonIE Card to a Claude Code session. Card shows session status and outcomes. |
| **Task dispatch** | From a Card's context menu: "Send to Claude Code" pre-fills a prompt with the Card's content. |
| **Result capture** | Claude Code session summaries can be auto-captured as Notes linked to the originating Card. |
| **Canvas-to-prompt** | Select a region of a Canvas (e.g., a hand-drawn architecture diagram) and send it as visual context to a Claude Code session. |

### 5.4 Release Management Integration

| Feature | Description |
|---------|-------------|
| **Release Board template** | Pre-built Board with lanes: Backlog, In Dev, In Review, QA, Staging, Released |
| **Version tracking** | Cards can be tagged with version numbers; Board can filter by release version |
| **Changelog generation** | AI generates a changelog from all Cards moved to "Released" lane since last version |
| **CI/CD status** | Cards linked to GitHub PRs show build/deploy status badges |
| **Milestone Canvas** | Visual Canvas showing release timeline with embedded Cards for each feature/fix |

### 5.5 Additional Integration Targets (Future)

- **Calendar** (Google Calendar, Outlook): Due dates on Cards create calendar events; meeting events can auto-create Canvas pages for notes
- **Slack / Teams**: Share Cards or Canvas snapshots to channels; create Cards from messages
- **Email**: Forward emails to create Cards; email notifications for Card updates
- **Webhooks API**: Generic inbound/outbound webhooks for custom integrations
- **Zapier / Make**: Low-code integration with hundreds of services

---

## 6. AI Pipeline

AI is not a feature — it is the backbone that makes pen-first input viable.

### 6.1 Processing Pipeline

```
Raw Input (strokes, photo, voice)
    |
    v
+-------------------+
| Preprocessing     |  Normalize coordinates, resample strokes,
|                   |  prepare image/audio for models
+-------------------+
    |
    v
+-------------------+
| Recognition       |  Handwriting -> text, Speech -> text,
|                   |  Photo -> OCR, Shape -> geometry
+-------------------+
    |
    v
+-------------------+
| Extraction        |  Items, relationships, action items,
|                   |  checklists, tags, entities
+-------------------+
    |
    v
+-------------------+
| Structuring       |  Create/update Cards, set links,
|                   |  suggest Board placement, tag
+-------------------+
    |
    v
+-------------------+
| Indexing           |  Update search index, embeddings
|                   |  for semantic search
+-------------------+
```

### 6.2 AI Capabilities

| Capability | Input | Output | Latency Target |
|------------|-------|--------|----------------|
| Handwriting recognition | Stroke data | Recognized text | < 500ms (streaming, per word) |
| Shape detection | Stroke data | Geometric shapes (rect, circle, arrow, line) | < 200ms |
| Region segmentation | Canvas snapshot | Bounding boxes for distinct content areas | < 2s |
| Relationship extraction | Canvas snapshot + recognized text | Item-relationship graph (current prototype) | < 5s |
| Photo OCR | Image | Extracted text with positions | < 2s |
| Photo + annotation interpretation | Image + stroke overlay | Combined understanding of content + annotations | < 5s |
| Voice transcription | Audio | Text transcript | Real-time streaming |
| Action item extraction | Text (any source) | List of action items with suggested assignees and due dates | < 2s |
| Auto-tagging | Card content | Suggested tags | < 1s |
| Semantic search | Query text | Relevant Cards ranked by semantic similarity | < 500ms |
| Canvas-to-Board suggestion | Canvas snapshot | Suggested Board structure with Lanes and Cards | < 5s |

### 6.3 AI Processing Strategy

- **On-device**: Handwriting recognition and shape detection should run locally for latency reasons. Use on-device ML models (Core ML on Apple, ONNX/TFLite on Android/web).
- **Edge/server**: Region segmentation, relationship extraction, and complex interpretation run server-side using vision LLMs (building on the existing GPT-4o integration).
- **Hybrid**: Start with on-device recognition for immediate feedback, refine with server-side processing for higher accuracy. User sees progressive enhancement.

---

## 7. Technical Architecture

### 7.1 High-Level System Architecture

```
+----------------------------------------------------------------+
|                        Client Applications                      |
|  +-------------+  +-------------+  +-------------------------+ |
|  |   iOS App   |  | Android App |  |   Web App (PWA)         | |
|  | (Swift UI)  |  | (Kotlin)    |  |   (React/Canvas API)    | |
|  +------+------+  +------+------+  +------------+------------+ |
|         |                |                       |              |
+---------+----------------+-----------------------+--------------+
          |                |                       |
          +--------+-------+-----------+-----------+
                   |                   |
          +--------v--------+  +-------v--------+
          |  REST / GraphQL |  |   WebSocket    |
          |      API        |  |   (real-time)  |
          +---------+-------+  +-------+--------+
                    |                  |
+-------------------+------------------+----------------------+
|                      API Gateway / Load Balancer             |
+-------------------+------------------------------------------+
          |                   |                    |
+---------v--------+ +-------v--------+ +---------v---------+
|  Core Service    | | Collaboration  | |  AI Pipeline       |
|                  | | Service        | |  Service           |
| - Cards CRUD    | | - WebSocket    | | - Handwriting rec  |
| - Boards CRUD   | | - CRDT engine  | | - Vision analysis  |
| - Canvas CRUD   | | - Presence     | | - Transcription    |
| - Auth / Perms  | | - Conflict res | | - Extraction       |
+---------+--------+ +-------+--------+ +---------+---------+
          |                   |                    |
+---------v-------------------v--------------------v----------+
|                        Data Layer                            |
|  +-------------+  +--------------+  +-----------+           |
|  | PostgreSQL  |  |  S3 / Blob   |  |  Redis    |           |
|  | (metadata,  |  |  (images,    |  |  (cache,  |           |
|  |  cards,     |  |   ink data,  |  |   pub/sub,|           |
|  |  boards)    |  |   audio)     |  |   sessions|           |
|  +-------------+  +--------------+  +-----------+           |
|                                                              |
|  +-------------------+  +-------------------+               |
|  | Search Index      |  | Vector DB         |               |
|  | (Elasticsearch /  |  | (pgvector /       |               |
|  |  Meilisearch)     |  |  Pinecone)        |               |
|  +-------------------+  +-------------------+               |
+--------------------------------------------------------------+
          |
+---------v---------------------------------------------------+
|                   Integration Layer                          |
|  +----------+ +----------+ +----------+ +-----------+       |
|  | GitHub   | | Calendar | | Claude   | | Webhooks  |       |
|  | Adapter  | | Adapter  | | Code     | | Engine    |       |
|  +----------+ +----------+ +----------+ +-----------+       |
+--------------------------------------------------------------+
```

### 7.2 Client Architecture

**Web (PWA)**: React + TypeScript. Canvas rendering via HTML5 Canvas API with a custom rendering engine. Offline support via Service Workers + IndexedDB for local data and stroke caching. This is the universal fallback — works on all devices via browser.

**iOS (native)**: SwiftUI for UI, PencilKit for Apple Pencil integration. PencilKit provides best-in-class ink rendering and on-device handwriting recognition. Offline-first with CoreData.

**Android (native)**: Kotlin + Jetpack Compose. Custom ink rendering engine using Android's `MotionEvent` and `Canvas` APIs. S Pen and USI stylus support. Offline-first with Room.

**Shared logic**: Core business logic (Card model, sync protocol, CRDT operations) implemented in Kotlin Multiplatform or Rust with FFI bindings. The web app uses a WASM build of the shared module.

### 7.3 Data Synchronization

**Sync protocol**: Each client maintains a local database. Changes are captured as operations (ops) and synced to the server. The server merges ops using CRDTs and broadcasts to other clients via WebSocket.

```
Client A writes     Client B writes
    |                    |
    v                    v
Local op log        Local op log
    |                    |
    v                    v
+---+--------------------+---+
|         Sync Server         |
|   (merge via CRDT rules)   |
+---+--------------------+---+
    |                    |
    v                    v
Broadcast to B     Broadcast to A
```

**Offline support**: All content creation and editing works offline. Ops queue locally and sync when connectivity resumes. Conflict resolution is automatic for ink and text (CRDT merge). For structured fields, last-writer-wins with full history.

**Ink data sync**: Stroke data is stored as compact binary (protobuf-encoded point arrays). Strokes are immutable once committed — edits create new strokes and tombstone old ones. This makes CRDT merge straightforward for ink.

### 7.4 Data Models (Database Schema)

```
users
  id              UUID PK
  email           TEXT UNIQUE
  display_name    TEXT
  avatar_url      TEXT
  created_at      TIMESTAMP

workspaces
  id              UUID PK
  name            TEXT
  owner_id        UUID FK -> users
  created_at      TIMESTAMP

workspace_members
  workspace_id    UUID FK -> workspaces
  user_id         UUID FK -> users
  role            ENUM('owner', 'admin', 'editor', 'viewer')

boards
  id              UUID PK
  workspace_id    UUID FK -> workspaces
  name            TEXT
  board_type      ENUM('kanban', 'list', 'timeline', 'custom')
  created_by      UUID FK -> users
  created_at      TIMESTAMP

lanes
  id              UUID PK
  board_id        UUID FK -> boards
  name            TEXT
  position        INTEGER
  color           TEXT

cards
  id              UUID PK
  workspace_id    UUID FK -> workspaces
  title           TEXT
  body_text       TEXT          -- rendered/recognized text content
  source          ENUM('pen', 'keyboard', 'photo', 'voice', 'ai_extracted', 'integration')
  status          ENUM('open', 'in_progress', 'done', 'archived')
  created_by      UUID FK -> users
  created_at      TIMESTAMP
  updated_at      TIMESTAMP

card_board_placements
  card_id         UUID FK -> cards
  lane_id         UUID FK -> lanes
  position        INTEGER

card_canvas_placements
  card_id         UUID FK -> cards
  canvas_id       UUID FK -> canvases
  x               FLOAT
  y               FLOAT
  width           FLOAT
  height          FLOAT

canvases
  id              UUID PK
  workspace_id    UUID FK -> workspaces
  name            TEXT
  created_by      UUID FK -> users
  created_at      TIMESTAMP

strokes
  id              UUID PK
  canvas_id       UUID FK -> canvases
  user_id         UUID FK -> users
  stroke_data     BYTEA         -- protobuf-encoded point array
  color           TEXT
  width           FLOAT
  tool            ENUM('pen', 'highlighter', 'eraser')
  created_at      TIMESTAMP
  deleted_at      TIMESTAMP     -- soft delete for CRDT tombstones

photos
  id              UUID PK
  card_id         UUID FK -> cards
  storage_url     TEXT          -- S3/blob URL
  ocr_text        TEXT
  created_at      TIMESTAMP

voice_memos
  id              UUID PK
  card_id         UUID FK -> cards
  storage_url     TEXT
  transcript      TEXT
  duration_ms     INTEGER
  created_at      TIMESTAMP

card_links
  id              UUID PK
  source_card_id  UUID FK -> cards
  target_card_id  UUID FK -> cards
  link_type       ENUM('related', 'blocks', 'blocked_by', 'parent', 'child', 'duplicate')

tags
  id              UUID PK
  workspace_id    UUID FK -> workspaces
  name            TEXT
  path            TEXT          -- hierarchical: "work/project-alpha"
  color           TEXT

card_tags
  card_id         UUID FK -> cards
  tag_id          UUID FK -> tags

integration_links
  id              UUID PK
  card_id         UUID FK -> cards
  provider        ENUM('github', 'claude_code', 'calendar', 'slack', 'webhook')
  external_id     TEXT          -- e.g., github issue number
  external_url    TEXT
  sync_mode       ENUM('mirror', 'push', 'pull', 'manual')
  sync_state      JSONB         -- provider-specific sync metadata
  last_synced_at  TIMESTAMP

ai_extractions
  id              UUID PK
  source_type     ENUM('canvas', 'photo', 'voice')
  source_id       UUID          -- FK to canvas, photo, or voice_memo
  extraction_type ENUM('text', 'items', 'relationships', 'action_items', 'tags')
  result          JSONB
  confidence      FLOAT
  created_at      TIMESTAMP
```

### 7.5 API Design (Key Endpoints)

```
# Cards
POST   /api/v1/cards                    Create a Card
GET    /api/v1/cards/:id                Get a Card
PATCH  /api/v1/cards/:id                Update a Card
DELETE /api/v1/cards/:id                Archive a Card
GET    /api/v1/cards/search?q=          Search Cards (full-text + semantic)

# Boards
POST   /api/v1/boards                   Create a Board
GET    /api/v1/boards/:id               Get Board with Lanes and Cards
PATCH  /api/v1/boards/:id/lanes/:id     Move Card to Lane
POST   /api/v1/boards/:id/cards         Create Card directly on a Board

# Canvases
POST   /api/v1/canvases                 Create a Canvas
GET    /api/v1/canvases/:id             Get Canvas with strokes and placements
POST   /api/v1/canvases/:id/strokes     Submit stroke data (batch)
POST   /api/v1/canvases/:id/process     Trigger AI extraction

# Quick Capture
POST   /api/v1/capture/text             Quick text note
POST   /api/v1/capture/photo            Quick photo (multipart)
POST   /api/v1/capture/voice            Quick voice memo (multipart)
POST   /api/v1/capture/ink              Quick handwritten note (stroke data)

# Integrations
POST   /api/v1/integrations/github/connect       OAuth connect
POST   /api/v1/integrations/github/sync/:card_id  Sync Card <-> Issue
POST   /api/v1/integrations/claude-code/dispatch   Send Card to Claude Code

# Real-time (WebSocket)
WS     /ws/v1/boards/:id               Board collaboration channel
WS     /ws/v1/canvases/:id             Canvas collaboration channel
```

---

## 8. Security & Privacy

| Concern | Approach |
|---------|----------|
| **Authentication** | OAuth 2.0 / OpenID Connect. Social login (Google, Apple, GitHub). |
| **Authorization** | Role-based per Workspace (owner, admin, editor, viewer). Row-level security in database. |
| **Data at rest** | AES-256 encryption for all blob storage. Database-level encryption. |
| **Data in transit** | TLS 1.3 everywhere. WebSocket over WSS. |
| **AI data handling** | Ink/photo data sent to AI services is not used for training. Option for on-premise AI processing for enterprise. |
| **Sharing** | Explicit invitation model. Shared links can be time-limited and password-protected. |
| **Audit log** | All writes logged with user, timestamp, and operation. Accessible to workspace admins. |

---

## 9. Phased Delivery Roadmap

### Phase 1: Foundation — "Capture Anything" (MVP)

**Goal**: A single app that handles quick typed notes (replacing Keep), pen canvases (replacing OneNote), and makes all content searchable — regardless of how it was created.

**Deliverables**:
- Web app (PWA) with responsive design for tablet, phone, and desktop
- **Typed notes**: Full keyboard-driven Card creation and editing with rich text (Markdown), working well on phone and computer
- **Canvas surface**: Pen and touch drawing with handwriting recognition, extending the existing prototype
- **Mixed-mode Cards**: Cards that can contain both typed text and pen strokes in a single view
- Photo capture with pen/finger annotation overlay
- Basic tagging and search (full-text on typed content and recognized handwriting)
- Quick capture optimized per device: keyboard-first on phone/computer, pen-first on tablet
- Slash commands for keyboard power users
- Local storage with cloud sync for a single user

**Foundation work**:
- Set up React + TypeScript web app with Canvas rendering engine
- Implement stroke capture and storage (protobuf format)
- Implement rich text editor for typed content (Cards and text blocks on Canvas)
- Integrate on-device handwriting recognition model
- Build input-mode detection (auto-switch UI based on pointer type)
- Build Card CRUD API and PostgreSQL schema
- Set up S3-compatible blob storage for images and stroke data

### Phase 2: Collaboration — "Better Trello"

**Goal**: Add shared Boards with real-time collaboration, replacing Trello.

**Deliverables**:
- Board model with Lanes and Card placement
- Real-time sync via WebSocket + CRDT engine
- Multi-user: invitations, roles, permissions
- Board templates (Kanban, grocery list, etc.)
- Activity feed and notifications
- Keyboard shortcuts for board navigation and card management
- Pen gestures for Board interaction (scribble to create, strikethrough to complete)
- Workspace model for separating personal/family/work contexts

### Phase 3: Intelligence — "AI Everywhere"

**Goal**: AI processes all content types and connects ideas automatically.

**Deliverables**:
- Voice memo capture with real-time transcription
- Action item extraction from notes and voice memos
- AI-suggested tags and Board placement
- Canvas-to-Board: AI suggests a Board structure from a freeform Canvas
- Semantic search (vector embeddings for finding related content)
- Smart Views: saved filters with AI-powered suggestions ("notes from meetings this week with unresolved action items")
- Relationship extraction between Cards (AI detects "this Card is related to these other Cards")

### Phase 4: Integrations — "Connected Workflows"

**Goal**: STonIE becomes a hub connecting to developer and productivity tools.

**Deliverables**:
- GitHub integration (Issue sync, PR tracking, commit references)
- Claude Code integration (dispatch tasks, capture results)
- Calendar integration (meeting -> Canvas page, due dates -> events)
- Release management Board template with CI/CD status badges
- Webhooks API (inbound and outbound)
- Changelog generation from Board activity

### Phase 5: Native & Scale

**Goal**: Native apps for best-in-class pen experience; scale infrastructure.

**Deliverables**:
- iOS app with PencilKit integration
- Android app with S Pen / USI stylus support
- Offline-first architecture with robust sync
- Horizontal scaling of collaboration and AI services
- Enterprise features: SSO, admin console, on-premise AI option

---

## 10. Relationship to Current Prototype

The existing STonIE Notes prototype validates the core technical hypothesis: **AI can extract structured, meaningful data from freeform canvas drawings**. The design document builds on this foundation:

| Current Prototype | Unified App |
|---|---|
| Single HTML5 Canvas page | Multi-canvas Workspace with infinite surfaces + keyboard-driven Cards and Boards |
| Canvas-only input (pen/mouse drawing) | Multi-modal input: pen, keyboard, voice, camera — all producing the same Card objects |
| Flat image submission (base64 PNG) | Stroke-level data capture (preserving full fidelity) + rich text for typed content |
| Batch GPT-4o processing after submit | Streaming on-device recognition + server-side deep analysis |
| File system output (PNG, JSON) | Persistent database with Cards, Boards, Canvases |
| Single user, no auth | Multi-user with real-time collaboration |
| No search | Full-text + semantic search across all content types and input modes |
| No integrations | GitHub, Claude Code, Calendar, Webhooks |
| Desktop browser only | Responsive across phone (keyboard-optimized), tablet (pen+keyboard), computer (keyboard+mouse) |

The prototype's `canvasProcessor.js` worker becomes the starting point for the AI Pipeline Service. The region detection, item extraction, and relationship mapping logic is preserved and extended with streaming handwriting recognition and additional extraction types (action items, checklists, tags).

---

## 11. Open Questions for Review

1. **Native vs. PWA priority**: Should Phase 1 target a PWA for universal access, or a native iPad app for best pen experience? The design assumes PWA-first for faster iteration, but native PencilKit offers significantly better ink rendering. A PWA offers faster iteration on the keyboard/typing experience across all devices.

2. **AI provider strategy**: The prototype uses OpenAI GPT-4o. Should the unified app standardize on Anthropic Claude for consistency with the Claude Code integration? Or support multiple providers?

3. **Self-hosted vs. cloud**: Is a self-hosted option important for privacy-sensitive users, or is cloud-only acceptable for the initial release?

4. **Monetization model**: Freemium with limits on AI processing and storage? Per-workspace pricing? This affects architecture decisions (multi-tenant vs. isolated).

5. **Pen gesture vocabulary**: How discoverable should pen gestures be? Should we prioritize a small set of highly reliable gestures, or a rich gesture language with a learning curve?

6. **Handwriting recognition model**: Use a commercial API (Apple's on-device, Google ML Kit) for Phase 1, or invest in training a custom model for better accuracy on mixed diagrams + text?

7. **Collaboration granularity**: Should real-time collaboration work at the Canvas level (everyone sees all strokes live, like a shared whiteboard) or at the Card level (Cards sync, but individual canvas work is private until shared)?

8. **Input mode defaults**: When a user opens the app on a tablet, should it default to Canvas (pen-ready) or Board/Card list (keyboard-ready)? Options: (a) always open to the last-used view, (b) detect if a stylus is connected and adapt, (c) let the user configure their default per device.

9. **Rich text editor choice**: For the keyboard-driven typing experience, should we use an existing editor framework (ProseMirror, TipTap, Lexical) or build a custom one? Existing frameworks speed up Phase 1 but may complicate Canvas text block integration.
