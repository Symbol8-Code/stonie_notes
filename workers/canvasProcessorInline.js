/**
 * Inline (non-Worker) version of canvasProcessor for serverless environments.
 * Worker Threads are not available in Vercel serverless functions,
 * so this module exports the processing logic as async functions.
 */

const {
  MODEL, parseLlmJson, buildMeetingNotesPrompt, READ_TEXT_PROMPT, INTERPRET_PROMPT,
} = require('./shared');

let client;

function getClient() {
  if (!client) {
    const openai = require('openai');
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
  const messageContent = [{ type: "input_text", text: buildMeetingNotesPrompt(textContent, canvasData) }];
  if (canvasData) {
    messageContent.push({ type: "input_image", image_url: canvasData });
  }

  const response = await llm.responses.create({
    input: [{ role: 'user', content: messageContent }],
    model: MODEL,
  });

  return parseLlmJson(response.output_text);
}

async function processReadText(llm, canvasData) {
  const response = await llm.responses.create({
    input: [{
      role: 'user',
      content: [
        { type: "input_text", text: READ_TEXT_PROMPT },
        { type: "input_image", image_url: canvasData }
      ]
    }],
    model: MODEL,
  });

  const rawText = response.output_text.trim();
  return { text: rawText, description: rawText, category: 'text', items: [], relationships: [] };
}

async function processInterpret(llm, canvasData) {
  const response = await llm.responses.create({
    input: [{
      role: 'user',
      content: [
        { type: "input_text", text: INTERPRET_PROMPT },
        { type: "input_image", image_url: canvasData }
      ]
    }],
    model: MODEL,
  });

  return parseLlmJson(response.output_text);
}

module.exports = { processCanvas };
