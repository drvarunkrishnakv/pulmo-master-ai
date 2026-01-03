
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'exam_notifications.json');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function scrapeNBE(page) {
    try {
        console.log('Scraping NBE (NEET-SS)...');
        await page.goto('https://natboard.edu.in/viewNotice.php?NBE=0', { waitUntil: 'networkidle0', timeout: 30000 });

        // Wait for table
        try {
            await page.waitForSelector('table', { timeout: 10000 });
        } catch (e) {
            console.log('NBE table not found immediately');
        }

        const notices = await page.evaluate(() => {
            const items = [];
            const rows = document.querySelectorAll('tr');
            const currentYear = new Date().getFullYear();
            const patterns = [
                new RegExp(`NEET-SS ${currentYear}`, 'i'),
                new RegExp(`NEET-SS ${currentYear + 1}`, 'i'),
                /NEET[-\s]?SS/i
            ];

            rows.forEach(row => {
                const text = row.innerText;
                const link = row.querySelector('a')?.href;

                if (text && link) {
                    const isMatch = patterns.some(p => p.test(text));
                    if (isMatch) {
                        items.push({
                            id: `neetss-${text.substring(0, 20).replace(/\s+/g, '')}`,
                            examType: 'NEET-SS',
                            title: text.trim().split('\n')[0],
                            year: currentYear.toString(),
                            links: { official: link },
                            detectedAt: Date.now()
                        });
                    }
                }
            });
            return items;
        });

        console.log(`Found ${notices.length} NEET-SS notices.`);
        return notices;
    } catch (error) {
        console.error('Error scraping NBE:', error);
        return [];
    }
}

async function scrapeINISS(page) {
    try {
        console.log('Scraping AIIMS (INI-SS) via Interactive Search...');
        await page.goto('https://www.aiimsexams.ac.in/landingpage/notice', { waitUntil: 'networkidle2', timeout: 60000 });

        // Wait for search input
        const inputSelector = 'input[placeholder="Search"]';
        await page.waitForSelector(inputSelector, { timeout: 10000 });

        // Type INI-SS
        await page.type(inputSelector, 'INI-SS');

        // Click Search Button (assuming it's the primary button near the input)
        // We use a more specific selector strategy or click the button containing "Search" icon/text
        const searchBtnSelector = 'button.btn-primary';
        await page.click(searchBtnSelector);

        console.log('Clicked search, waiting for results...');

        // Wait for results to update (simple wait or valid selector)
        await new Promise(r => setTimeout(r, 5000));

        // Get all text content
        const pageText = await page.evaluate(() => document.body.innerText);
        console.log('INI-SS Page Text Length:', pageText.length);
        console.log('Preview:', pageText.substring(0, 500));

        const notices = await page.evaluate(() => {
            const items = [];
            // Strategy: Find all H6 elements (titles) and check for INI-SS
            const headings = Array.from(document.querySelectorAll('h6'));
            const currentYear = new Date().getFullYear();

            const patterns = [
                /INI[-\s]?SS/i,
                /Super\s*Speciali[sz]ation/i
            ];

            headings.forEach((h6, index) => {
                const text = h6.innerText.trim();
                if (text.length > 10 && patterns.some(p => p.test(text))) {
                    // Try to find a link nearby
                    const card = h6.closest('div'); // Assuming card structure
                    const link = card?.querySelector('a')?.href || 'https://www.aiimsexams.ac.in/landingpage/notice';

                    items.push({
                        id: `iniss-${currentYear}-${index}-${text.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '')}`,
                        examType: 'INI-SS',
                        title: text,
                        year: currentYear.toString(),
                        links: { official: link },
                        detectedAt: Date.now()
                    });
                }
            });

            // Remove duplicates
            const unique = [];
            const titles = new Set();
            for (const item of items) {
                if (!titles.has(item.title)) {
                    titles.add(item.title);
                    unique.push(item);
                }
            }
            return unique;
        });

        console.log(`Found ${notices.length} INI-SS notices.`);
        return notices;
    } catch (error) {
        console.error('Error scraping INI-SS:', error);
        return [];
    }
}


async function main() {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        const nbe = await scrapeNBE(page);
        const aimms = await scrapeINISS(page);

        const all = [...nbe, ...aimms];

        // Write to file
        const data = {
            updatedAt: new Date().toISOString(),
            notifications: all
        };

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
        console.log(`Saved ${all.length} notifications to ${OUTPUT_FILE}`);

    } catch (error) {
        console.error('Main error:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

main();
