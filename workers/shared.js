/**
 * Shared LLM prompts, helpers, and client factory.
 * Used by both the Worker Thread processor and the inline serverless processor.
 */

const MODEL = process.env.LLM_MODEL || 'gpt-5.4';

/**
 * Strip markdown JSON fences and parse the response.
 */
function parseLlmJson(raw) {
  const trimmed = raw.trim();
  const match = trimmed.match(/```(?:json|JSON)?\s*\n([\s\S]*?)\n\s*```/);
  return JSON.parse(match ? match[1] : trimmed);
}

function buildMeetingNotesPrompt(textContent, canvasData) {
  return `You are analyzing notes from a meeting. The content may include handwritten drawings/diagrams and typed text.

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
}

const READ_TEXT_PROMPT = `Read the handwritten text in this image. Return ONLY the exact words/text that are written, nothing else. Do not describe the image. Do not add quotes. Just output the literal text content.`;

const INTERPRET_PROMPT = `Analyze this handwritten note or drawing. Provide a structured interpretation including:

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

module.exports = {
  MODEL,
  parseLlmJson,
  buildMeetingNotesPrompt,
  READ_TEXT_PROMPT,
  INTERPRET_PROMPT,
};
