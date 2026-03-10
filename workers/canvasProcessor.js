const dotenv = require('dotenv');
const dotenvExpand = require('dotenv-expand');
dotenvExpand.expand(dotenv.config());
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const openai = require('openai')
const { createCanvas, loadImage } = require('canvas'); // Correctly import createCanvas and loadImage
const rootDir = "./"

const apiKey = process.env['OPENAI_API_KEY'];
if (!apiKey) {
  throw new Error('The OPENAI_API_KEY environment variable is missing or empty');
}
const client = new openai.OpenAI({
  apiKey: apiKey,
});


parentPort.on('message', async (data) => {
  console.log("Worker 'canvasProcessor': received message ");
  const { canvasData, canvasId, requestId, mode } = data;
  const base64Data = canvasData.replace(/^data:image\/png;base64,/, "");

  console.log("Worker 'canvasProcessor': sending to llm, mode:", mode || 'interpret');

  // Simple text extraction mode for reading handwritten text (e.g. headings)
  if (mode === 'readText') {
    const readTextPrompt = `Read the handwritten text in this image. Return ONLY the exact words/text that are written, nothing else. Do not describe the image. Do not add quotes. Just output the literal text content.`;

    try {
      const chatCompletion = await client.chat.completions.create({
        messages: [{
          role: 'user',
          content: [
            { type: "text", text: readTextPrompt },
            { type: "image_url", image_url: { url: canvasData } }
          ]
        }],
        model: 'gpt-4o',
      });

      const rawText = chatCompletion.choices[0].message.content.trim();
      console.log("Worker 'canvasProcessor': readText result:", rawText);

      parentPort.postMessage({
        success: true,
        message: 'Text extracted successfully',
        canvasId,
        requestId,
        jsonData: { text: rawText, description: rawText, category: 'text', items: [], relationships: [] }
      });
    } catch (error) {
      console.error('Error in readText mode:', error);
      parentPort.postMessage({ success: false, message: 'Text extraction failed', error, canvasId, requestId });
    }
    return;
  }

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

  const chatCompletion = await client.chat.completions.create({
    messages: [
        {
            role: 'user',
            content: [
                { type: "text", text: interpretPrompt },
                { type: "image_url", image_url: { url: canvasData } }
            ]
        }],
    model: 'gpt-4o',
  });

  const llmResponse = chatCompletion.choices[0].message.content;
  console.log("Worker 'canvasProcessor': recieved from llm: size: ", llmResponse.length);

  //Check message for json, clean it and extract it
  console.log("Worker 'canvasProcessor': llmResponse: " + llmResponse);

  //Save the jsonResponse to a file
  const llmResponseFileName = `${canvasId}_llm_response.txt`;
  const llmResponseFilePath = path.join(rootDir, 'saved_canvases', llmResponseFileName);
  fs.writeFile(llmResponseFilePath, llmResponse, (err) => {
    if (err) {
      console.error('Error saving LLM response:', err);
    } else {
      console.log('LLM response saved successfully');
    }
  });

  // Check for valid JSON
  let jsonData;
  try {
    const cleanedJsonResponse = llmResponse.replace(/```json\n/, '').replace(/\n```/, '');
    console.log("Worker 'canvasProcessor': cleanedJsonResponse: ", cleanedJsonResponse);
    jsonData = JSON.parse(cleanedJsonResponse);
    //pretty print jsonData
    console.log("Worker 'canvasProcessor': jsonData: ", JSON.stringify(jsonData, null, 2));
  } catch (error) {
    console.error('Invalid JSON response:', error);
    parentPort.postMessage({ success: false, message: 'Invalid JSON response', error, canvasId, requestId });
    return;
  }

  //pretty print jsonData
  console.log(JSON.stringify(jsonData, null, 2));

  //Save jsonData to a file
  const jsonFileName = `${canvasId}.json`;
  const jsonFilePath = path.join(rootDir, 'saved_canvases', jsonFileName);
  fs.writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2), (err) => {
    if (err) {
      console.error('Error saving JSON data:', err);
    } else {
      console.log('JSON data saved successfully');
    }
  });

  //Save image to a file
  const fileName = `${canvasId}.png`;
  const filePath = path.join(rootDir, 'saved_canvases', fileName);

  fs.writeFile(filePath, base64Data, 'base64', (err) => {
    if (err) {
      parentPort.postMessage({ success: false, message: 'Failed to save canvas', error: err, canvasId, requestId });
    } else {
      parentPort.postMessage({ success: true, message: 'Canvas saved successfully', fileName: path.basename(filePath), canvasId, requestId, jsonData });
    }
  });

  //Mark the canvas up with the json data
  //Add red boxes around the items
  //Add blue boxes around the relationships
  //Add text labels to the items and relationships
  //Save the canvas to a file

  const markedUpCanvas = await markUpCanvas(base64Data, jsonData);
  const markedUpCanvasFilePath = path.join(rootDir, 'saved_canvases', `${canvasId}_marked.png`);
  fs.writeFile(markedUpCanvasFilePath, markedUpCanvas, 'base64', (err) => {
    if (err) {
      console.error('Error saving marked up canvas:', err);
    } else {
      console.log('Marked up canvas saved successfully');
    }
  });


});

/**
 * Marks up the canvas with the provided JSON data.
 * 
 * This function takes the base64 encoded canvas data and the JSON data containing
 * information about items and their relationships. It draws red boxes around the items,
 * blue boxes around the relationships, and adds text labels to the items and relationships.
 * 
 * @param {string} base64Data - The base64 encoded canvas data.
 * @param {Object} jsonData - The JSON data containing information about items and their relationships.
 * @returns {Promise<string>} - A promise that resolves to the base64 encoded marked up canvas data.
 */
async function markUpCanvas(base64Data, jsonData) {
  const image = await loadImage(`data:image/png;base64,${base64Data}`);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');

  // Draw the image onto the canvas
  ctx.drawImage(image, 0, 0);

  if (jsonData["items"]){
    // Draw red boxes around items
    jsonData["items"].forEach(item => {
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2;
      ctx.strokeRect(item.x_position, item.y_position, item.width, item.height);
    });
  } else {
    console.log("Worker 'canvasProcessor' -> markUpCanvas: 'Items' array not found in JSON data");
  }

  if (jsonData["relationships"]){
    // Draw blue boxes around relationships
    jsonData["relationships"].forEach(item => {
      ctx.strokeStyle = 'blue';
      ctx.lineWidth = 2;
      ctx.strokeRect(item.x_position, item.y_position, item.width, item.height);
     });
  } else {
    console.log("Worker 'canvasProcessor' -> markUpCanvas: 'Relationships' array not found in JSON data");
  }

  // Return the marked up canvas as base64
  return canvas.toDataURL().split(',')[1];
}
