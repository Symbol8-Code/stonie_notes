require('dotenv').config(); 
const { parentPort } = require('worker_threads');
const fs = require('fs');
const path = require('path');
const openai = require('openai')
const rootDir = "./"

const apiKey = process.env['OPENAI_API_KEY'];
if (!apiKey) {
  throw new Error('The OPENAI_API_KEY environment variable is missing or empty');
}
const client = new openai.OpenAI({
  apiKey: apiKey,
});


parentPort.on('message', async (data) => {
  const { canvasData, canvasId } = data;
  const base64Data = canvasData.replace(/^data:image\/png;base64,/, "");

  const chatCompletion = await client.chat.completions.create({
    messages: [
        { 
            role: 'user', 
           "content": [
                {
                "type": "text",
                "text": "What’s in this image?"
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

  console.log("Chat Response: ", chatCompletion.choices[0].message)

  const fileName = `${canvasId}.png`;
  const filePath = path.join(rootDir, 'saved_canvases', fileName);

  fs.writeFile(filePath, base64Data, 'base64', (err) => {
    if (err) {
      parentPort.postMessage({ success: false, message: 'Failed to save canvas', error: err, canvasId });
    } else {
      parentPort.postMessage({ success: true, message: 'Canvas saved successfully', fileName: path.basename(filePath), canvasId });
    }
  });
});