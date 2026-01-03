import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PROJECT_ID = 'pulmo-master';
const LOCATION = 'us-central1';
const BUCKET_NAME = 'pulmo-master.firebasestorage.app';
const MODEL_ID = 'gemini-2.5-flash'; // Using the model ID found in existing scripts

const TOPIC_LIST_FILE = path.join(__dirname, '../data/rag/topic-list.json');
const BATCH_DIR = path.join(__dirname, '../content/batch-jobs');

const SYSTEM_PROMPT = `You are an expert Pulmonology Professor designing questions for the NEET-SS and INI-SS exams.
Your task is to generate high-yield, "One-Liner" conceptual MCQs.

CRITICAL RULES:
1. NO clinical vignettes. NO "A 45-year-old male presents with...".
2. Focus on: Direct facts, Mechanisms of action, Diagnostic "Gold Standards", Drug of Choice, Specific Criteria (e.g., Light's, GOLD stages), and High-Yield Timelines.
3. Length: The question itself must be under 30 words.
4. Difficulty: Must be "Post-Graduate Level" (NEET-SS/INI-SS).
5. Format: Standard JSON array of objects.

JSON Structure:
{
  "question": "The most sensitive test for detecting early bronchiectasis is?",
  "options": {
    "A": "Chest X-Ray",
    "B": "HRCT Thorax",
    "C": "MRI Chest",
    "D": "Spirometry"
  },
  "correctAnswer": "B",
  "topic": "topic_id",
  "deepDiveExplanation": "...",
  "highYieldPearl": "...",
  "examStyle": "NEET-SS",
  "difficulty": "Easy",
  "trapAnalysis": "..."
}`;

interface Topic {
    id: string;
    name: string;
    priority: 'high' | 'medium' | 'low';
}

interface BatchRequest {
    request: {
        contents: Array<{ role: string; parts: Array<{ text: string }> }>;
        generationConfig?: {
            responseMimeType?: string;
            temperature?: number;
        };
    };
    metadata: string;
}

const storage = new Storage({ projectId: PROJECT_ID });

async function getAccessToken(): Promise<string> {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token.token || '';
}

async function uploadToGCS(localPath: string): Promise<string> {
    const fileName = path.basename(localPath);
    const gcsPath = `batch-jobs/${fileName}`;
    console.log(`\n☁️  Uploading to GCS: gs://${BUCKET_NAME}/${gcsPath}`);
    await storage.bucket(BUCKET_NAME).upload(localPath, {
        destination: gcsPath
    });
    console.log('✓ Upload complete');
    return `gs://${BUCKET_NAME}/${gcsPath}`;
}

async function submitBatchJob(inputGcsUri: string): Promise<string> {
    console.log('\n🚀 Submitting batch job...');
    const timestamp = Date.now();
    const outputGcsUri = `gs://${BUCKET_NAME}/batch-jobs/one-liner-output-${timestamp}/`;
    const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/batchPredictionJobs`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await getAccessToken()}`
        },
        body: JSON.stringify({
            displayName: `one-liner-generation-${timestamp}`,
            model: `projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL_ID}`,
            inputConfig: {
                instancesFormat: 'jsonl',
                gcsSource: {
                    uris: [inputGcsUri]
                }
            },
            outputConfig: {
                predictionsFormat: 'jsonl',
                gcsDestination: {
                    outputUriPrefix: outputGcsUri
                }
            }
        })
    });

    const job = await response.json();
    if (job.error) {
        throw new Error(`Batch job creation failed: ${job.error.message}`);
    }
    console.log(`✓ Job submitted: ${job.name}`);
    console.log(`  Output prefix: ${outputGcsUri}`);

    fs.writeFileSync(
        path.join(BATCH_DIR, `one-liner-job-${timestamp}.json`),
        JSON.stringify(job, null, 2)
    );

    return job.name;
}

async function createBatchInputFile(): Promise<string> {
    console.log('\n📋 Preparing distribution for one-liner MCQs...\n');

    const topicData = JSON.parse(fs.readFileSync(TOPIC_LIST_FILE, 'utf-8'));
    const topics: Topic[] = topicData.topics;

    const batchRequests: BatchRequest[] = [];
    let totalTarget = 0;

    for (const topic of topics) {
        let count = 2; // Low
        if (topic.priority === 'high') count = 10;
        if (topic.priority === 'medium') count = 5;

        totalTarget += count;

        const prompt = `${SYSTEM_PROMPT}

Generate exactly ${count} high-yield, unique one-liner conceptual MCQs for the topic: "${topic.name}".
Set the "topic" field in the JSON to "${topic.id}".
Ensure the questions are distinct and cover essential pg-level concepts for this specific topic.`;

        batchRequests.push({
            request: {
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: 'application/json',
                    temperature: 0.7
                }
            },
            metadata: `one-liner|${topic.id}|${topic.name}|${count}`
        });
    }

    console.log(`✓ Prepared ${topics.length} topics`);
    console.log(`✓ Total target MCQs: ${totalTarget}`);

    if (!fs.existsSync(BATCH_DIR)) {
        fs.mkdirSync(BATCH_DIR, { recursive: true });
    }

    const timestamp = Date.now();
    const inputFileName = `one-liner-input-${timestamp}.jsonl`;
    const inputFilePath = path.join(BATCH_DIR, inputFileName);

    const jsonlContent = batchRequests.map(req => JSON.stringify(req)).join('\n');
    fs.writeFileSync(inputFilePath, jsonlContent);

    console.log(`✓ Created: ${inputFilePath}`);
    return inputFilePath;
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  PULMO-MASTER AI - ONE-LINER BATCH MCQ PREPARATION             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');

    try {
        const inputFilePath = await createBatchInputFile();
        const inputGcsUri = await uploadToGCS(inputFilePath);
        const jobName = await submitBatchJob(inputGcsUri);

        console.log(`\n✅ One-liner batch job successfully submitted!`);
        console.log(`Job ID: ${jobName}`);
        console.log(`\nPolling is NOT started automatically to avoid holding the process.`);
        console.log(`The system will poll for results in the background once the job completes.`);
    } catch (error: any) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    }
}

main();
