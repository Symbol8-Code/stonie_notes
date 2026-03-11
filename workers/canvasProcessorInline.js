/**
 * Inline (non-Worker) version of canvasProcessor for serverless environments.
 * Worker Threads are not available in Vercel serverless functions,
 * so this module exports the processing logic as async functions.
 */

const openai = require('openai');

let client;

function getClient() {
  if (!client) {
    const apiKey = process.env['OPENAI_API_KEY'];
    if (!apiKey) {
      throw new Error('The OPENAI_API_KEY environment variable is missing or empty');
    }
    client = new openai.OpenAI({ apiKey });
  }
  return client;
}

/**
 * Interpret a canvas drawing via LLM.
 * @param {object} data - { canvasData, mode, textContent }
 * @returns {Promise<object>} Parsed JSON result from the LLM
 */
async function processCanvas(data) {
  const { canvasData, mode, textContent } = data;
  const llm = getClient();

  if (mode === 'meetingNotes') {
    return processMeetingNotes(llm, canvasData, textContent);
  }

  if (mode === 'readText') {
    return processReadText(llm, canvasData);
  }

  return processInterpret(llm, canvasData);
}

async function processMeetingNotes(llm, canvasData, textContent) {
  const meetingNotesPrompt = `You are analyzing notes from a meeting. The content may include handwritten drawings/diagrams and typed text.

${textContent ? `Typed text content from the notes:\n---\n${textContent}\n---\n` : ''}

${canvasData ? 'An image of handwritten/drawn content from the meeting is also attached.' : ''}

Please extract and write up structured meeting notes suitable for emailing to participants and storing as a formal record.
Do make up any topics that are not explicitly mentioned. You may provide some interpretation but if should be grounded in what is written.

Return ONLY valid JSON in this exact format:
{
  "title": "Meeting title or topic (inferred from content)",
  "date": "Meeting date if mentioned, otherwise null",
  "attendees": ["List of attendees if mentioned, otherwise empty array"],
  "summary": "A concise 2-3 sentence summary of what was discussed",
  "agenda_items": ["List of agenda items or topics discussed"],
  "discussion_points": [
    {
      "topic": "Topic heading",
      "details": "Key points discussed under this topic"
    }
  ],
  "decisions": ["List of decisions made during the meeting"],
  "next_steps": [
    {
      "action": "Description of the action item",
      "owner": "Person responsible (if mentioned, otherwise null)",
      "due_date": "Due date if mentioned, otherwise null"
    }
  ],
  "notes": "Any additional notes or context that don't fit the above categories"
}

Be thorough in extracting all content. If information for a field isn't available, use null for strings or empty arrays for lists.`;

  const messageContent = [{ type: "input_text", text: meetingNotesPrompt }];
  if (canvasData) {
    messageContent.push({ type: "input_image", image_url: canvasData });
  }

  const response = await llm.responses.create({
    input: [{ role: 'user', content: messageContent }],
    model: 'gpt-5.4',
  });

  const rawResponse = response.output_text.trim();
  const cleaned = rawResponse.replace(/```json\n?/, '').replace(/\n?```/, '');
  return JSON.parse(cleaned);
}

async function processReadText(llm, canvasData) {
  const readTextPrompt = `Read the handwritten text in this image. Return ONLY the exact words/text that are written, nothing else. Do not describe the image. Do not add quotes. Just output the literal text content.`;

  const response = await llm.responses.create({
    input: [{
      role: 'user',
      content: [
        { type: "input_text", text: readTextPrompt },
        { type: "input_image", image_url: canvasData }
      ]
    }],
    model: 'gpt-5.4',
  });

  const rawText = response.output_text.trim();
  return { text: rawText, description: rawText, category: 'text', items: [], relationships: [] };
}

async function processInterpret(llm, canvasData) {
  const interpretPrompt = `Analyze this handwritten note or drawing. Provide a structured interpretation including:

1. A brief description of what the image contains (e.g. "A mindmap about project planning", "A to-do list with 5 items", "A diagram showing system architecture")
2. A category for the content type (one of: mindmap, list, diagram, flowchart, notes, sketch, table, other)
3. All identifiable items/elements with their positions
4. Relationships between items (arrows, lines, groupings) if present

Respond ONLY with valid JSON in this exact format:
{
  "description": "Brief human-readable description of the note contents",
  "category": "mindmap|list|diagram|flowchart|notes|sketch|table|other",
  "items": [
    {
      "item_id": "a unique guid",
      "item": "text or label of the item",
      "x_position": 10,
      "y_position": 20,
      "width": 80,
      "height": 40
    }
  ],
  "relationships": [
    {
      "relationship_id": "a unique guid",
      "item_id": "source item guid",
      "related_item_id": "target item guid",
      "relationship_direction": "from or to",
      "label": "optional label on the connection",
      "x_position": 100,
      "y_position": 50,
      "width": 100,
      "height": 20
    }
  ]
}

If the image contains simple text notes with no relationships, the relationships array should be empty.
If items have no clear bounding boxes, estimate reasonable positions.`;

  const response = await llm.responses.create({
    input: [{
      role: 'user',
      content: [
        { type: "input_text", text: interpretPrompt },
        { type: "input_image", image_url: canvasData }
      ]
    }],
    model: 'gpt-5.4',
  });

  const rawResponse = response.output_text.trim();
  const cleaned = rawResponse.replace(/```json\n?/, '').replace(/\n?```/, '');
  return JSON.parse(cleaned);
}

module.exports = { processCanvas };
