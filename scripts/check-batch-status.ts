import { GoogleAuth } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ID = 'pulmo-master';
const LOCATION = 'us-central1';

async function getAccessToken(): Promise<string> {
    const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token.token || '';
}

async function checkStatus(jobId: string) {
    const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/batchPredictionJobs/${jobId}`;

    const response = await fetch(endpoint, {
        headers: {
            'Authorization': `Bearer ${await getAccessToken()}`
        }
    });

    const job = await response.json();
    console.log(JSON.stringify(job, null, 2));
}

// Get JOB_ID from command line or use a default if provided via environment
const jobId = process.argv[2] || process.env.JOB_ID;

if (!jobId) {
    console.error('Please provide a Job ID as an argument: npx tsx scripts/check-batch-status.ts <JOB_ID>');
    process.exit(1);
}

checkStatus(jobId).catch(console.error);
