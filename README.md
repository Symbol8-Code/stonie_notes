# STonIE Notes

An input-adaptive workspace that replaces the fragmented toolset of Trello, Google Keep, and OneNote with a single AI-powered application. Type on your phone, scribble with a pen during a meeting, or use keyboard shortcuts on your laptop — STonIE Notes treats all input modes as first-class citizens and uses AI to organize, link, and interpret everything into structured, searchable data.

## Tech Stack

| Layer      | Technology                                  |
|------------|---------------------------------------------|
| Backend    | Node.js, Express.js 4                       |
| Frontend   | React 19, TypeScript, Vite                  |
| Database   | PostgreSQL with Drizzle ORM                 |
| AI         | OpenAI GPT-4o (Vision API)                  |
| Processing | Node.js Worker Threads (canvas analysis)    |

## Prerequisites

- **Node.js** (v18+)
- **PostgreSQL** (v14+)
- **OpenAI API key**

## Getting Started

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd stonie_notes

# Install server dependencies
npm install

# Install client dependencies
cd client && npm install && cd ..
```

### 2. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp .env_example .env
```

Edit `.env`:

```
OPENAI_API_KEY=your_openai_api_key
DATABASE_URL=postgresql://user:password@localhost:5432/stonie_notes
```

### 3. Set up the database

Create the PostgreSQL database, then push the schema:

```bash
createdb stonie_notes
npm run db:push
```

### 4. Run the app

**Development** (server + client with hot reload):

```bash
# Terminal 1 — start the Express server
npm start

# Terminal 2 — start the Vite dev server for the React client
npm run dev:client
```

The Express server runs on `http://localhost:3000` and the Vite dev server on `http://localhost:5173`.

**Production** (serve the built client from Express):

```bash
npm run build:client
npm start
```

The built React app is served at `http://localhost:3000/app`.

## Project Structure

```
stonie_notes/
├── server.js                 # Express server, routes, worker orchestration
├── package.json              # Server dependencies and scripts
├── drizzle.config.js         # Drizzle ORM / migration config
├── .env_example              # Environment variable template
├── db/
│   ├── index.js              # Database connection
│   ├── schema.js             # Drizzle schema (cards, canvases, boards, etc.)
│   └── migrations/           # Generated SQL migrations
├── routes/
│   ├── cards.js              # /api/v1/cards — Card CRUD + search
│   └── canvases.js           # /api/v1/canvases — Canvas CRUD + strokes
├── workers/
│   └── canvasProcessor.js    # AI-powered canvas analysis (Worker Thread)
├── public/                   # Legacy vanilla JS frontend
│   ├── index.html            # Landing page
│   ├── canvas.html           # Freehand drawing interface
│   └── pen_event.html        # Pointer event debugging tool
├── client/                   # React + TypeScript frontend (Vite)
│   ├── src/
│   │   ├── App.tsx           # Root shell with responsive layout
│   │   ├── pages/            # Inbox, Boards, Canvases, Search
│   │   ├── components/       # Sidebar, FloatingActionButton
│   │   ├── hooks/            # useInputMode, useMediaQuery
│   │   ├── services/         # API client
│   │   ├── types/            # TypeScript models
│   │   └── styles/           # CSS
│   └── package.json
└── saved_canvases/           # Output directory for processed canvases
```

## Available Scripts

| Command              | Description                                 |
|----------------------|---------------------------------------------|
| `npm start`          | Start the Express server                    |
| `npm run dev:client` | Start the Vite dev server (React client)    |
| `npm run build:client` | Build the React client for production     |
| `npm run db:generate`| Generate Drizzle migration files            |
| `npm run db:push`    | Push schema directly to the database        |
| `npm run db:studio`  | Open Drizzle Studio (database GUI)          |

## API Overview

### Cards API (`/api/v1/cards`)

| Method | Endpoint                | Description                    |
|--------|-------------------------|--------------------------------|
| POST   | `/api/v1/cards`         | Create a card                  |
| GET    | `/api/v1/cards`         | List cards (paginated, filterable by status) |
| GET    | `/api/v1/cards/search?q=` | Full-text search across cards |
| GET    | `/api/v1/cards/:id`     | Get a single card              |
| PATCH  | `/api/v1/cards/:id`     | Update a card                  |
| DELETE | `/api/v1/cards/:id`     | Archive a card (soft delete)   |

### Canvases API (`/api/v1/canvases`)

| Method | Endpoint                          | Description                |
|--------|-----------------------------------|----------------------------|
| POST   | `/api/v1/canvases`                | Create a canvas            |
| GET    | `/api/v1/canvases`                | List canvases (paginated)  |
| GET    | `/api/v1/canvases/:id`            | Get canvas with strokes    |
| POST   | `/api/v1/canvases/:id/strokes`    | Submit strokes to a canvas |

### Legacy Canvas API

| Method | Endpoint             | Description                              |
|--------|----------------------|------------------------------------------|
| POST   | `/api/save-canvas`   | Submit a canvas drawing for AI analysis  |
| GET    | `/api/list-canvas`   | List all canvas entries and their status  |
