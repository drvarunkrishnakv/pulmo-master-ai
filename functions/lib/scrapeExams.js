"use strict";
/**
 * Exam Notification Scraper
 *
 * Uses Puppeteer to scrape NBE (NEET-SS) and AIIMS (INI-SS) exam pages.
 * Works with JavaScript-rendered content.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeNEETSS = scrapeNEETSS;
exports.scrapeINISS = scrapeINISS;
exports.scrapeAllExams = scrapeAllExams;
const puppeteer = __importStar(require("puppeteer-core"));
const chromium = require('@sparticuz/chromium');
const EXAM_SOURCES = {
    NEET_SS: 'https://natboard.edu.in/viewnbeexam?exam=neetss',
    INI_SS: 'https://www.aiimsexams.ac.in/landingpage/notice'
};
/**
 * Scrape NBE NEET-SS page
 */
async function scrapeNEETSS(page) {
    try {
        console.log('Scraping NBE NEET-SS page...');
        await page.goto(EXAM_SOURCES.NEET_SS, { waitUntil: 'networkidle2', timeout: 30000 });
        // Wait for content to load
        await page.waitForSelector('body', { timeout: 10000 });
        // Get page content
        const content = await page.content();
        // Find the latest year section (2025, 2026, etc.)
        const currentYear = new Date().getFullYear();
        const years = [currentYear + 1, currentYear, currentYear - 1];
        for (const year of years) {
            // Check if this year's section exists
            const yearRegex = new RegExp(`##\\s*${year}`, 'i');
            if (yearRegex.test(content)) {
                // Extract links for this year
                const bulletinMatch = content.match(new RegExp(`Information Bulletin[^"]*href="([^"]+)"`, 'i'));
                const applicationMatch = content.match(new RegExp(`Application Link[^"]*href="([^"]+)"`, 'i'));
                const resultsMatch = content.match(new RegExp(`Results[^"]*href="([^"]+)"`, 'i'));
                if (bulletinMatch || applicationMatch) {
                    return {
                        id: `neetss-${year}`,
                        examType: 'NEET-SS',
                        title: `NEET-SS ${year} Updates Available`,
                        year: year.toString(),
                        links: {
                            informationBulletin: bulletinMatch === null || bulletinMatch === void 0 ? void 0 : bulletinMatch[1],
                            applicationLink: applicationMatch === null || applicationMatch === void 0 ? void 0 : applicationMatch[1],
                            results: resultsMatch === null || resultsMatch === void 0 ? void 0 : resultsMatch[1],
                            official: EXAM_SOURCES.NEET_SS
                        },
                        detectedAt: Date.now()
                    };
                }
            }
        }
        console.log('No new NEET-SS updates found');
        return null;
    }
    catch (error) {
        console.error('Error scraping NEET-SS:', error);
        return null;
    }
}
/**
 * Scrape AIIMS INI-SS page
 * Uses Puppeteer to render JavaScript content
 */
async function scrapeINISS(page) {
    try {
        console.log('Scraping AIIMS INI-SS dedicated notices page...');
        // Use the search URL directly
        const searchUrl = 'https://www.aiimsexams.ac.in/landingpage/notice?searchText=INI-SS';
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        // Wait for content (interactive page)
        await page.waitForSelector('body', { timeout: 10000 });
        await new Promise(resolve => setTimeout(resolve, 5000));
        // Get all text content
        const pageText = await page.evaluate(() => document.body.innerText);
        console.log('INI-SS Notices Page Text Length:', pageText.length);
        // Look for INI-SS related keywords
        const iniSSPatterns = [
            /INI[-\s]?SS/gi,
            /Super\s*Speciali[sz]ation/gi,
            /SS[-\s]?Fellowship/gi,
            /DM\s*\/\s*MCh/gi
        ];
        for (const pattern of iniSSPatterns) {
            console.log('Checking pattern:', pattern);
            const matches = pageText.match(pattern);
            if (matches && matches.length > 0) {
                // Try to extract the notice context
                const lines = pageText.split('\n');
                for (const line of lines) {
                    if (pattern.test(line) && line.length > 10 && line.length < 300) {
                        return {
                            id: `iniss-${Date.now()}`,
                            examType: 'INI-SS',
                            title: line.trim(),
                            year: new Date().getFullYear().toString(),
                            links: {
                                official: searchUrl
                            },
                            detectedAt: Date.now()
                        };
                    }
                }
            }
        }
        console.log('No specific INI-SS pattern matches found in notices list');
        return null; // No match found
    }
    catch (error) {
        console.error('Error scraping INI-SS:', error);
        return null;
    }
}
/**
 * Run the full scraping job
 */
async function scrapeAllExams() {
    const notifications = [];
    // Launch Puppeteer with optimized Chromium for AWS Lambda / Firebase Functions
    const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true
    });
    try {
        const page = await browser.newPage();
        // Set User-Agent to avoid bot detection
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        // Enable request interception to speed up loading
        await page.setRequestInterception(true);
        // Scrape NEET-SS
        const neetss = await scrapeNEETSS(page);
        if (neetss) {
            notifications.push(neetss);
        }
        // Scrape INI-SS
        const iniss = await scrapeINISS(page);
        if (iniss) {
            notifications.push(iniss);
        }
    }
    finally {
        await browser.close();
    }
    console.log(`Found ${notifications.length} notifications`);
    return notifications;
}
//# sourceMappingURL=scrapeExams.js.map