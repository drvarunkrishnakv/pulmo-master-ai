
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from "@google/genai";

// Load environment variables manually
const envFiles = ['.env.local', '.env'];
for (const file of envFiles) {
    const envPath = path.join(process.cwd(), file);
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split(/\r?\n/).forEach(line => {
            line = line.trim();
            if (!line || line.startsWith('#')) return;
            const eqIdx = line.indexOf('=');
            if (eqIdx > 0) {
                let key = line.slice(0, eqIdx).trim();
                let value = line.slice(eqIdx + 1).trim();
                if (key.startsWith('export ')) key = key.slice(7).trim();
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                if (!process.env[key]) process.env[key] = value;
            }
        });
    }
}

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
const INPUT_DIR = path.join(process.cwd(), 'content/generated-mcqs');
const MODEL_NAME = 'gemini-2.5-flash-lite';
const BATCH_SIZE = 5;

const ai = new GoogleGenAI({ apiKey });

// Keywords that indicate radiology-related content
const RADIOLOGY_KEYWORDS = [
    'hrct', 'ct scan', 'chest x-ray', 'x-ray', 'radiograph', 'imaging',
    'scan shows', 'ct shows', 'xray', 'cxr', 'chest radiograph',
    'ground glass', 'honeycombing', 'consolidation', 'infiltrate',
    'nodule', 'mass', 'opacity', 'effusion', 'pneumothorax',
    'bronchiectasis', 'fibrosis', 'cavitation', 'hilar', 'mediastinal'
];

interface MCQ {
    id: string;
    question: string;
    options: { A: string; B: string; C: string; D: string };
    correctAnswer: string;
    imageDescription?: string;
    externalImageUrl?: string;
    [key: string]: any;
}

const imageDescriptionSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            id: { type: Type.STRING },
            imageDescription: {
                type: Type.STRING,
                description: "2-3 sentence vivid description of the radiological finding described in the question"
            }
        },
        required: ["id", "imageDescription"]
    }
};

function isRadiologyQuestion(mcq: MCQ): boolean {
    const text = (mcq.question + ' ' + Object.values(mcq.options).join(' ')).toLowerCase();
    return RADIOLOGY_KEYWORDS.some(kw => text.includes(kw));
}

async function processBatch(mcqs: MCQ[]): Promise<MCQ[]> {
    const radiologyMCQs = mcqs.filter(m => isRadiologyQuestion(m) && !m.imageDescription);
    if (radiologyMCQs.length === 0) return mcqs;

    const prompt = `
    You are an expert radiologist and medical educator. For each MCQ below, generate a vivid 2-3 sentence description of the radiological finding being described.
    
    The description should:
    - Be written as if describing the image to someone who cannot see it
    - Include specific anatomical locations and characteristics
    - Use standard radiological terminology
    - NOT reveal the diagnosis directly
    
    Example:
    Question: "A 65-year-old presents with progressive dyspnea. HRCT shows bilateral, basal-predominant reticular opacities with honeycombing..."
    Good description: "High-resolution CT demonstrates bilateral subpleural reticular abnormalities predominantly affecting the lower lobes. Multiple thick-walled cystic spaces (honeycombing) are clustered at the lung bases with associated traction bronchiectasis. There is a clear apicobasal gradient with relative sparing of the upper zones."

    INPUT MCQs:
    ${JSON.stringify(radiologyMCQs.map(m => ({
        id: m.id,
        question: m.question
    })), null, 2)}
    `;

    try {
        const result = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: imageDescriptionSchema
            }
        });

        const responseText = result.text || "[]";
        const descriptions = JSON.parse(responseText);

        return mcqs.map(mcq => {
            const desc = descriptions.find((d: any) => d.id === mcq.id);
            if (desc && desc.imageDescription) {
                return { ...mcq, imageDescription: desc.imageDescription };
            }
            return mcq;
        });

    } catch (error: any) {
        // Recursive retry for large batches
        if (radiologyMCQs.length > 1) {
            console.log(`  ⚠️ Batch failed. Splitting ${radiologyMCQs.length} items...`);
            const mid = Math.floor(radiologyMCQs.length / 2);
            const left = radiologyMCQs.slice(0, mid);
            const right = radiologyMCQs.slice(mid);

            const resLeft = await processBatch(left);
            const resRight = await processBatch(right);

            const processedFlat = [...resLeft, ...resRight];
            return mcqs.map(m => processedFlat.find(p => p.id === m.id) || m);
        }
        console.error(`  ❌ Failed to process:`, error.message);
        return mcqs;
    }
}

async function processFile(filePath: string) {
    console.log(`Processing: ${path.basename(filePath)}`);
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        let data: any = JSON.parse(content);

        let mcqs: MCQ[] = Array.isArray(data) ? data : (data.mcqs || []);
        const isWrapped = !Array.isArray(data) && data.mcqs;

        if (mcqs.length === 0) {
            console.log('  No MCQs found.');
            return;
        }

        // Count radiology questions
        const radiologyCount = mcqs.filter(m => isRadiologyQuestion(m) && !m.imageDescription).length;
        if (radiologyCount === 0) {
            console.log('  No radiology MCQs need processing.');
            return;
        }

        console.log(`  Found ${radiologyCount} radiology MCQs to process...`);

        const updatedMCQs: MCQ[] = [];
        let hasUpdates = false;

        for (let i = 0; i < mcqs.length; i += BATCH_SIZE) {
            const batch = mcqs.slice(i, i + BATCH_SIZE);
            const needsProcessing = batch.some(m => isRadiologyQuestion(m) && !m.imageDescription);

            if (needsProcessing) {
                console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(mcqs.length / BATCH_SIZE)}...`);
                const processed = await processBatch(batch);
                updatedMCQs.push(...processed);
                if (processed.some(p => p.imageDescription)) hasUpdates = true;
                await new Promise(r => setTimeout(r, 300));
            } else {
                updatedMCQs.push(...batch);
            }
        }

        if (hasUpdates) {
            if (isWrapped) {
                data.mcqs = updatedMCQs;
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            } else {
                fs.writeFileSync(filePath, JSON.stringify(updatedMCQs, null, 2));
            }
            console.log(`  ✅ Saved updates.`);
        }

    } catch (error) {
        console.error(`Error processing ${filePath}:`, error);
    }
}

async function main() {
    console.log('🖼️ Starting Image Description Upgrade...');
    console.log(`API Key: ${apiKey ? 'Set' : 'MISSING!'}`);

    if (!fs.existsSync(INPUT_DIR)) {
        console.error(`Directory not found: ${INPUT_DIR}`);
        return;
    }

    const files = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith('.json') && f !== 'index.json');
    console.log(`Found ${files.length} books to process.\n`);

    for (const file of files) {
        await processFile(path.join(INPUT_DIR, file));
    }
    console.log('\n✨ Image description upgrade complete!');
}

main();
