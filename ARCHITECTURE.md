# STonIE Notes - Architecture Document

## Overview

STonIE Notes is a productivity application that transforms hand-drawn canvas sketches into structured, machine-readable data. Users draw on an HTML5 canvas in the browser, and the application uses OpenAI's GPT-4o Vision API to extract items, spatial positions, and relationships from the drawing, producing annotated visualizations and structured JSON output.

## High-Level Architecture

```
                         +-----------------------+
                         |      Browser          |
                         |  (Vanilla JS + HTML5) |
                         +-----------+-----------+
                                     |
                              HTTP / JSON
                          (base64 PNG payload)
                                     |
                         +-----------v-----------+
                         |    Express Server     |
                         |     (server.js)       |
                         |                       |
                         |  - Static file serving|
                         |  - REST API routes    |
                         |  - In-memory store    |
                         +-----------+-----------+
                                     |
                           Worker Thread
                          (postMessage)
                                     |
                         +-----------v-----------+
                         |   Canvas Processor    |
                         | (canvasProcessor.js)  |
                         |                       |
                         |  - OpenAI GPT-4o call |
                         |  - JSON extraction    |
                         |  - Canvas markup      |
                         |  - File persistence   |
                         +-----------+-----------+
                                     |
                              File System
                                     |
                         +-----------v-----------+
                         |   saved_canvases/     |
                         |  - {id}.png           |
                         |  - {id}.json          |
                         |  - {id}_llm_response  |
                         |  - {id}_marked.png    |
                         +-----------------------+
```

## Technology Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Runtime     | Node.js                           |
| Framework   | Express.js 4.21                   |
| Frontend    | Vanilla JavaScript, HTML5 Canvas  |
| AI/ML       | OpenAI GPT-4o (Vision API)        |
| Concurrency | Node.js Worker Threads            |
| Storage     | In-memory object + File system    |

## Project Structure

```
stonie_notes/
+-- server.js                  # Express server, routes, worker orchestration
+-- package.json               # Dependencies and scripts
+-- .env_example               # Environment variable template
+-- .gitignore                 # Git exclusions
+-- README.md                  # Project readme
+-- ARCHITECTURE.md            # This document
+-- public/                    # Static frontend assets
|   +-- index.html             # Landing page with navigation
|   +-- canvas.html            # Main drawing interface
|   +-- pen_event.html         # Pointer event testing/debugging page
+-- workers/                   # Background processing
|   +-- canvasProcessor.js     # AI-powered canvas analysis worker
+-- saved_canvases/            # Output directory for processed canvases
    +-- _placeholder           # Keeps directory in git
```

## Components

### 1. Express Server (`server.js`)

The central orchestrator of the application. Responsibilities:

- **Static file serving**: Serves the `public/` directory for frontend assets.
- **JSON body parsing**: Uses `body-parser` with a 10MB limit to accommodate base64-encoded PNG images.
- **Route handling**: Defines page routes and API endpoints.
- **Worker management**: Spawns a single long-lived Worker Thread at startup and communicates via message passing.
- **In-memory state**: Maintains a `canvasStore` object that tracks all canvas submissions and their processing status.

**Startup flow:**
1. Initializes Express app and middleware
2. Spawns a single `canvasProcessor` Worker Thread
3. Registers worker event handlers (`message`, `error`, `exit`)
4. Defines routes
5. Starts listening on the configured port (default: 3000)

### 2. Frontend (`public/`)

#### Landing Page (`index.html`)

A minimal navigation page that links to the canvas drawing interface. Contains no JavaScript.

#### Canvas Drawing Interface (`canvas.html`)

The primary user-facing page. Features:

- **Full-screen HTML5 Canvas** with a white background, occupying the viewport minus a 200px controls sidebar.
- **Pointer Events API** for freehand drawing, with a fallback to Mouse Events for browsers without pointer support.
- **Drawing logic**: Tracks the last pointer position and draws line segments between consecutive `pointermove` events using the Canvas 2D API.
- **Save workflow**: Exports the canvas as a base64 PNG via `canvas.toDataURL("image/png")`, sends it to the `/api/save-canvas` endpoint, and displays the result via `alert()`.
- **Layout**: Flexbox-based with a header, canvas area, and controls sidebar.

#### Pointer Event Testing Page (`pen_event.html`)

A developer utility page for debugging pen/stylus pointer events. Registers handlers for all pointer event types (`pointerdown`, `pointermove`, `pointerup`, `pointerover`, `pointerenter`, `pointercancel`, `pointerout`, `pointerleave`, `pointerrawupdate`, `gotpointercapture`, `lostpointercapture`) and logs attributes like `tiltX` and `tiltY` to the console.

### 3. Canvas Processor Worker (`workers/canvasProcessor.js`)

A Node.js Worker Thread that handles the CPU/IO-intensive work of AI analysis and file generation. This runs in a separate thread to avoid blocking HTTP request handling.

**Processing pipeline (per canvas):**

```
Receive message from parent
        |
        v
Strip base64 header from PNG data
        |
        v
Send image to OpenAI GPT-4o Vision API
  (with structured extraction prompt)
        |
        v
Receive LLM response
        |
        +---> Save raw LLM response to {id}_llm_response.txt
        |
        v
Parse JSON from LLM response
  (strip markdown code fences if present)
        |
        +---> Save parsed JSON to {id}.json
        |
        v
Save original canvas PNG to {id}.png
        |
        v
Generate marked-up canvas visualization
  (red boxes = items, blue boxes = relationships)
        |
        +---> Save marked canvas to {id}_marked.png
        |
        v
Send success/failure message back to parent
```

**AI Prompt Strategy**: The worker sends a detailed prompt to GPT-4o that includes:
- Instructions to extract items and relationships from the image
- A JSON schema describing the expected output format (items with positions/dimensions, relationships with directions)
- A complete worked example with realistic data to guide the model's output

**Canvas Markup**: Uses the `canvas` npm package (node-canvas) to:
1. Load the original PNG image
2. Draw red bounding boxes around detected items
3. Draw blue bounding boxes around detected relationships
4. Export the annotated image as base64 PNG

## API Endpoints

### Page Routes

| Method | Path          | Description                       |
|--------|---------------|-----------------------------------|
| GET    | `/`           | Landing page (`index.html`)       |
| GET    | `/canvas`     | Drawing interface (`canvas.html`) |
| GET    | `/pen_event`  | Pointer event test page           |

### REST API

#### `POST /api/save-canvas`

Submits a canvas drawing for AI-powered analysis.

**Request body:**
```json
{
  "canvasData": "data:image/png;base64,iVBOR...",
  "canvasTitle": "My Drawing"
}
```

**Response:**
```json
{
  "message": "Processing canvas",
  "canvasId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Behavior**: Immediately returns with a `canvasId` while the worker processes the image asynchronously. The canvas entry is created in the in-memory store with status `"preparing"`.

#### `GET /api/list-canvas`

Returns the full in-memory canvas store containing all canvas entries and their current processing status.

**Response:**
```json
{
  "a1b2c3d4-...": {
    "canvasId": "a1b2c3d4-...",
    "canvasTitle": "My Drawing",
    "status": "processed",
    "filename": "a1b2c3d4-....png",
    "processMessage": "Canvas saved successfully"
  }
}
```

**Canvas status values:**
- `"preparing"` - Submitted, not yet processed
- `"processed"` - Successfully analyzed and saved
- `"error"` - Processing failed (includes `processError` field)

## Data Model

### Canvas Store Entry (in-memory)

```
canvasStore[canvasId] = {
  canvasId:        string    // UUID v4 identifier
  canvasTitle:     string    // User-provided title
  status:          string    // "preparing" | "processed" | "error"
  filename:        string    // Output PNG filename (set after processing)
  processMessage:  string    // Status message from worker
  processError:    object    // Error details (only when status is "error")
}
```

### LLM Output Schema (extracted JSON)

```
{
  items: [
    {
      item_id:    string    // UUID for the item
      item:       string    // Descriptive name
      x_position: number    // X pixels from left edge
      y_position: number    // Y pixels from top edge
      width:      number    // Width in pixels
      height:     number    // Height in pixels
    }
  ],
  relationships: [
    {
      relationship_id:        string    // UUID for the relationship
      item_id:                string    // Source item reference
      related_item_id:        string    // Target item reference
      relationship_direction: string    // "from" or "to"
      x_position:             number    // X pixels from left edge
      y_position:             number    // Y pixels from top edge
      width:                  number    // Width in pixels
      height:                 number    // Height in pixels
    }
  ]
}
```

### File System Outputs (per canvas)

| File                        | Format | Content                                   |
|-----------------------------|--------|-------------------------------------------|
| `{canvasId}.png`            | PNG    | Original canvas drawing                   |
| `{canvasId}.json`           | JSON   | Extracted items and relationships          |
| `{canvasId}_llm_response.txt` | Text | Raw GPT-4o response (before JSON parsing) |
| `{canvasId}_marked.png`     | PNG    | Annotated canvas with bounding boxes      |

## Concurrency Model

```
Main Thread (Express)              Worker Thread (canvasProcessor)
========================           ================================
  |                                   |
  |-- worker.postMessage({data}) ---> |
  |   (non-blocking, returns         |-- calls OpenAI API (await)
  |    immediately to client)         |-- parses JSON response
  |                                   |-- writes files to disk
  |                                   |-- generates marked-up image
  | <-- parentPort.postMessage({}) ---|
  |   (updates canvasStore)           |
  |                                   |
```

- A **single Worker Thread** is spawned at server startup and persists for the server's lifetime.
- All canvas processing requests are serialized through this one worker (messages queue in the worker's event loop).
- The main Express thread remains responsive to HTTP requests while the worker handles slow operations (API calls, image processing, file I/O).
- Communication is message-based: the parent sends `{canvasData, canvasId}` and receives `{success, message, fileName, canvasId, error?}`.

## Dependencies

| Package       | Version  | Purpose                                              |
|---------------|----------|------------------------------------------------------|
| `express`     | ^4.21.0  | HTTP server framework and routing                    |
| `body-parser` | ^1.20.3  | JSON request body parsing (10MB limit)               |
| `canvas`      | ^2.11.2  | Server-side Canvas API for image annotation          |
| `openai`      | ^4.59.0  | OpenAI GPT-4o Vision API client                      |
| `uuid`        | ^10.0.0  | UUID v4 generation for canvas identifiers            |
| `dotenv`      | ^16.4.5  | Load environment variables from `.env` file          |

**Node.js built-in modules used:** `fs`, `path`, `worker_threads`

## Configuration

The application requires a single environment variable:

| Variable         | Required | Description             |
|------------------|----------|-------------------------|
| `OPENAI_API_KEY` | Yes      | OpenAI API key          |
| `PORT`           | No       | Server port (default: 3000) |

Set via a `.env` file in the project root (see `.env_example`).

## Current Limitations

- **No persistent database**: Canvas metadata is stored in-memory and lost on server restart. Only the file outputs persist.
- **No authentication or authorization**: All endpoints are open. Any client can submit canvases and list all results.
- **Single worker thread**: All canvas processing is serialized through one worker. Under concurrent load, requests queue up.
- **No input validation**: Canvas data and title are passed directly without sanitization or size validation beyond the 10MB body limit.
- **No test suite**: No automated tests exist for any part of the application.
- **No build pipeline**: The frontend uses vanilla JS with no bundling, transpilation, or minification.
- **No error recovery**: If the worker crashes (`exit` event with non-zero code), it is not respawned.
- **Base64 transfer overhead**: Canvas images are sent as base64 over JSON, adding ~33% size overhead versus binary transfer.
