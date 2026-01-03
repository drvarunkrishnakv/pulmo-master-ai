
import { GoogleGenAI } from "@google/genai";
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value && !process.env[key]) {
            process.env[key] = value.trim();
        }
    });
}

const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error("No API key");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function listModels() {
    try {
        const response = await ai.models.list();
        console.log("Available models:");
        // The SDK returns a list of models, likely in response.models
        // Printing raw response to be sure
        console.log(JSON.stringify(response, null, 2));
    } catch (error) {
        console.error("Error listing models:", error);
    }
}

listModels();
