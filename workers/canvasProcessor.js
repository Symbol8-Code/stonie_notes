require('dotenv').config(); 
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
  const { canvasData, canvasId } = data;
  const base64Data = canvasData.replace(/^data:image\/png;base64,/, "");

  console.log("Worker 'canvasProcessor': sending to llm");
  const chatCompletion = await client.chat.completions.create({
    messages: [
        { 
            role: 'user', 
           "content": [
                {
                "type": "text",
                "text": 
                  "I would like you to extract the key point of this image including the relationships between items, if they are shown on the image. "+
                  "Please respond using a concise json format: " +
                  "{" +
                      "items: [" +
                        "{" +
                          "item_id: 'a unique guid for the item', " +
                          "item: 'item name', " +
                          "x_position: 'X pixels from left edge of image', " +
                          "y_position: 'Y pixels from top edge of image', " +
                          "width: 'width in pixels', " +
                          "height: 'height in pixels'" +
                        "}, {...}" +
                      "]" +
                      "relationships: [" +
                        "{" +
                          "relationship_id: 'a unique guid for the relationship', " +
                          "item_id: 'the item_id of the item that is related to', " +
                          "related_item_id: 'the item_id of the item that is related to', " +
                          "relationship_direction: 'from' or 'to', " +
                          "x_position: 'X pixels from left edge of image', " +
                          "y_position: 'Y pixels from top edge of image', " +
                          "width: 'width in pixels', " +
                          "height: 'height in pixels'" +
                        "}, {...}" +
                      "]" +
                  "}, " +
                  "--------------" +
                  "for example:" +
                  "{" +
                    '"items: [" '+
                      "{" +
                        "item_id: '52f408bd-2f61-4d46-a32c-53d5cae31a89', " +
                        '"item": "Less work",' +
                        '"x_position": "2",' +
                        '"y_position": "2",' +
                        '"width": "84",' +
                        '"height": "16"' +
                      "}," +
                      "{" +
                        "item_id: '4a76ba15-f797-4f9f-92ed-c5012a6cb415', " +
                        '"item": "Samsung",' +
                        '"x_position": "88",' +
                        '"y_position": "2",' +
                        '"width": "95",' +
                        '"height": "22"' +
                      "}," +
                      "{" +
                        "item_id: '8a308eff-0eae-4459-a88c-7ea77dfc0bac', " +
                        '"item": "A bit of money",' +
                        '"x_position": "2",' +
                        '"y_position": "38",' +
                        '"width": "108",' +
                        '"height": "20"' + 
                      "}," +
                      "{" +
                        "item_id: '7060c67c-9410-47f6-b918-c8f1841a83b1', " +
                        '"item": "Notes",' +
                        '"x_position": "185",' +
                        '"y_position": "22",' +
                        '"width": "61",' +
                        '"height": "18"' +
                      "}," +
                      "{" +
                        "item_id: 'bd3f843b-f481-49f6-ba3a-87dca7204f3d', " +
                        '"item": "lots of money",' +
                        '"x_position": "184",' +
                        '"y_position": "38",' +
                        '"width": "93",' +
                        '"height": "20"' +
                      "}," +
                      "{" +
                        "item_id: '872747f9-fe45-4c16-ae61-2c51f7fd47b3', " +
                        '"item": "iPhone",' +
                        '"x_position": "184",' +
                        '"y_position": "38",' +
                        '"width": "93",' +
                        '"height": "20"' +
                      "}," +
                      "{" +
                        "item_id: '76e693a7-0105-4c5b-b81f-367e7430201d', " +
                        '"item": "Lots of work",' +
                        '"x_position": "347",' +
                        '"y_position": "2",' +
                        '"width": "86",' +
                        '"height": "20"' +
                      "}" +
                    "]," +
                    '"relationships": [' +
                      "{" +
                        '"relationship_id": "7bc6b9aa-3103-4226-9efa-4b277d8ed47a",' +
                        '"item_id": "4a76ba15-f797-4f9f-92ed-c5012a6cb415",' +
                        '"related_item_id": "52f408bd-2f61-4d46-a32c-53d5cae31a89",' +
                        '"relationship_direction": "to",' +
                        '"x_position": "86",' +
                        '"y_position": "2",' +
                        '"width": "100",' +
                        '"height": "20"' +
                      "}," +
                      "{" +
                        '"relationship_id": "8a3acb3d-4d37-4dbc-9ff8-de07d0a6a6fe",' +
                        '"item_id": "4a76ba15-f797-4f9f-92ed-c5012a6cb415",' +
                        '"related_item_id": "8a308eff-0eae-4459-a88c-7ea77dfc0bac",' +
                        '"relationship_direction": "to",' +
                        '"x_position": "86",' +
                        '"y_position": "24",' +
                        '"width": "100",' +
                        '"height": "20"' +
                      "}," +
                      "{" +
                        '"relationship_id": "e313dd9e-8fb0-4790-bb15-f661ef106e26",' +
                        '"item_id": "7060c67c-9410-47f6-b918-c8f1841a83b1",' +
                        '"related_item_id": "4a76ba15-f797-4f9f-92ed-c5012a6cb415",' +
                        '"relationship_direction": "from",' +
                        '"x_position": "180",' +
                        '"y_position": "20",' +
                        '"width": "100",' +
                        '"height": "20"' +
                      "}," +
                      "{" +
                        '"relationship_id": "1a53c3cc-d2b4-44f8-b5fb-2a75795dc79c",' +
                        '"item_id": "7060c67c-9410-47f6-b918-c8f1841a83b1",' +
                        '"related_item_id": "bd3f843b-f481-49f6-ba3a-87dca7204f3d",' +
                        '"relationship_direction": "to",' + 
                        '"x_position": "180",' +
                        '"y_position": "40",' +
                        '"width": "100",' +
                        '"height": "20"' +
                      "}," +
                      "{" +
                        '"relationship_id": "2fa3ae3a-61f0-43e6-a440-105d5937f6d8",' +  
                        '"item_id": "872747f9-fe45-4c16-ae61-2c51f7fd47b3",' +
                        '"related_item_id": "bd3f843b-f481-49f6-ba3a-87dca7204f3d",' +
                        '"relationship_direction": "from",' +
                        '"x_position": "280",' +
                        '"y_position": "22",' +
                        '"width": "100",' +
                        '"height": "20"' +
                      "}," +
                      "{" +
                        '"relationship_id": "bf122744-fa00-4cfc-8fc6-29bba78e38c7",' +  
                        '"item_id": "872747f9-fe45-4c16-ae61-2c51f7fd47b3",' +
                        '"related_item_id": "7060c67c-9410-47f6-b918-c8f1841a83b1",' +
                        '"relationship_direction": "to",' +
                        '"x_position": "280",' +
                        '"y_position": "42",' +
                        '"width": "100",' +
                        '"height": "20"' +
                      "}" +
                    "]" +
                  "}"
                },
                {
                "type": "image_url",
                "image_url": {
                    "url": canvasData
                }}
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
    parentPort.postMessage({ success: false, message: 'Invalid JSON response', error, canvasId });
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
      parentPort.postMessage({ success: false, message: 'Failed to save canvas', error: err, canvasId });
    } else {
      parentPort.postMessage({ success: true, message: 'Canvas saved successfully', fileName: path.basename(filePath), canvasId });
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
