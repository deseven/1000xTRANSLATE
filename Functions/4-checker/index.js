require('dotenv').config();
const path = require('path');
const fs = require('fs/promises');
const readline = require('readline');
const OpenAI = require('openai');
const ThousandXspreadsheeT = require('../../Misc/ThousandXspreadsheeT');

// Create readline interface
let rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_ENDPOINT,
});

// Initialize spreadsheet
const spreadsheet = new ThousandXspreadsheeT({
    GOOGLE_CREDENTIALS_FILE: path.join(__dirname, '../../' + process.env.GOOGLE_CREDENTIALS_FILE),
    SPREADSHEET_ID: process.env.SPREADSHEET_ID,
    ACTORS_SHEET_NAME: process.env.ACTORS_SHEET_NAME,
    QUESTS_SHEET_NAME: process.env.QUESTS_SHEET_NAME,
    SYSTEM_SHEET_NAME: process.env.SYSTEM_SHEET_NAME,
    DIALOGUES_SHEET_NAME: process.env.DIALOGUES_SHEET_NAME
});

async function mergeData() {
    //const actors = await spreadsheet.getActors();
    //const quests = await spreadsheet.getQuests();
    //const system = await spreadsheet.getSystem();
    const dialogues = await spreadsheet.getDialogues();

    const merged = {};

    // Merge simple structures
    //for (const [source, data] of [['actors', actors], ['quests', quests], ['system', system]]) {
    //    for (const [key, value] of Object.entries(data)) {
    //        merged[key] = {
    //            original: value.original,
    //            translated: value.translated
    //        };
    //    }
    //}

    // Merge dialogues
    for (const [key, value] of Object.entries(dialogues)) {
        if (!key.endsWith('MenuText') && value.original.trim() !== '') {
            merged[key] = {
                original: value.original,
                translated: value.translated
            };
        }
    }

    return merged;
}

async function checkTranslations(translations, maxRetries = 3, delay = 3000) {
    const simplifiedTranslations = Object.entries(translations).reduce((acc, [key, value]) => {
        acc[key] = value.translated;
        return acc;
    }, {});
    const prompt = `You will receive the strings written in ${process.env.LANG_TO} from the user. 

For each string, check for:
 - Grammar and spelling correctness
 - Appropriate punctuation
 - Overall natural flow in ${process.env.LANG_TO}

Don't overdo it, don't mind the context, only mention obvious errors. Having html tags and other languages in the strings is normal, so is having informal wording.

Respond with a JSON object where keys are the original keys and values are descriptions of any anomalies found. 
If a string is correct, do not include its key in the response. If there are no strings with any anomalies, return empty json object.

Example input for English:
\`\`\`
{
  "Actors/John": "John",
  "Quests/main/quest1/title": "Go to school",
  "Dialogue/HighSchool_v2/artroom/timeline1/John/45/DialogueText": "I should of brought it with me...",
  "System/ui/button/start": "New Gam"
}
\`\`\`

Example output:
\`\`\`
{
  "Dialogue/HighSchool_v2/artroom/timeline1/John/45/DialogueText": "'should of' is likely a mistake",
  "System/ui/button/start": "typo in 'Game'"
}
\`\`\``;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL,
                messages: [
                    { role: 'system', content: prompt },
                    { role: 'user', content: JSON.stringify(simplifiedTranslations, null, 2) }],
            });

            try {
                const completion = response.choices[0].message.content;
                const clean = completion.replace(/```json\n|```\n|```/g, '');
                const json = JSON.parse(clean);
                return json;
            } catch (e) {
                console.error('Failed to parse ChatGPT response');
                console.log(completion.choices[0].message.content);
                return {};
            }
        } catch (error) {
            console.error(`Attempt ${attempt}/${maxRetries} failed:`, error.message);

            if (attempt === maxRetries) {
                console.error('Max retries reached, quitting');
                process.exit(1);
                return {};
            }

            console.log(`Waiting ${delay / 1000} seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function updateReport(newAnomalies, translations) {
    let report = {};
    try {
        const existingReport = await fs.readFile(path.join(__dirname, 'report.json'), 'utf8');
        report = JSON.parse(existingReport);
    } catch (e) {
        // File doesn't exist or is invalid, starting fresh
    }

    for (const [key, anomaly] of Object.entries(newAnomalies)) {
        report[key] = {
            original: translations[key].original,
            translated: translations[key].translated,
            anomaly: anomaly
        };
    }

    await fs.writeFile(path.join(__dirname, 'report.json'), JSON.stringify(report, null, 2));
    return report;
}

async function generateHtmlReport(report) {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .filter-container { margin-bottom: 20px; }
            input { padding: 5px; margin-right: 10px; }
        </style>
        <script>
            function filterTable() {
                const input = document.getElementById('filter').value.toLowerCase();
                const rows = document.getElementsByTagName('tr');
                
                for (let i = 1; i < rows.length; i++) {
                    const text = rows[i].textContent.toLowerCase();
                    rows[i].style.display = text.includes(input) ? '' : 'none';
                }
            }
        </script>
    </head>
    <body>
        <div class="filter-container">
            <input type="text" id="filter" onkeyup="filterTable()" placeholder="Filter results...">
        </div>
        <table>
            <tr>
                <th>Key</th>
                <th>Original</th>
                <th>Translation</th>
                <th>Anomaly</th>
            </tr>
            ${Object.entries(report).map(([key, data]) => `
                <tr>
                    <td>${key}</td>
                    <td>${data.original}</td>
                    <td>${data.translated}</td>
                    <td>${data.anomaly}</td>
                </tr>
            `).join('')}
        </table>
    </body>
    </html>`;

    await fs.writeFile('checker-report.htm', html);
}

async function main() {
    try {
        // Load or initialize processed keys
        let processedKeys = new Set();
        try {
            const processed = await fs.readFile(path.join(__dirname, 'processed.json'), 'utf8');
            processedKeys = new Set(JSON.parse(processed));

            if (processedKeys.size > 0) {
                const answer = await question('Found previously processed keys. Continue from where we left off? (y/n): ');
                if (answer.toLowerCase() !== 'y') {
                    processedKeys.clear();
                    await fs.writeFile(path.join(__dirname, 'report.json'), '{}');
                }
            }
        } catch (e) {
            // No processed keys file, starting fresh
        }

        console.log('Starting translation check...');

        // Get and merge all data
        const allTranslations = await mergeData();
        const keys = Object.keys(allTranslations).filter(key => !processedKeys.has(key));

        let totalProcessed = 0;
        let totalAnomalies = 0;

        try {
            // Process in batches of 50
            for (let i = 0; i < keys.length; i += 50) {
                const batchKeys = keys.slice(i, i + 50);
                const batchTranslations = {};

                for (const key of batchKeys) {
                    batchTranslations[key] = allTranslations[key];
                }

                const anomalies = await checkTranslations(batchTranslations);
                await updateReport(anomalies, batchTranslations);

                // Update processed keys
                batchKeys.forEach(key => processedKeys.add(key));
                await fs.writeFile(path.join(__dirname, 'processed.json'), JSON.stringify([...processedKeys], null, 2));

                // Update statistics
                totalProcessed += batchKeys.length;
                totalAnomalies += Object.keys(anomalies).length;

                // Display progress
                console.log('\nProgress update:');
                console.log(`Processed in this batch: ${batchKeys.length}`);
                console.log(`Anomalies found in this batch: ${Object.keys(anomalies).length}`);
                console.log(`Remaining strings: ${keys.length - totalProcessed}`);
                console.log(`Total processed: ${totalProcessed}`);
                console.log(`Total anomalies found: ${totalAnomalies}`);

                await new Promise(resolve => setTimeout(resolve, 1500));
            }

        } catch (e) {
            console.error('Error during processing:', e);
        }

        gracefulShutdown();

    } catch (e) {
        console.error('Error:', e);
    } finally {
        if (!rl.closed) {
            rl.close();
        }
    }
}

// Graceful shutdown function
async function gracefulShutdown() {
    try {
        const report = JSON.parse(await fs.readFile(path.join(__dirname, 'report.json'), 'utf8'));
        await generateHtmlReport(report);
        console.log('HTML report generated successfully!');
        const { exec } = require('child_process');
        const reportPath = 'checker-report.htm';
        if (process.platform === 'darwin') {
            exec(`open "${reportPath}"`);
        } else if (process.platform === 'win32') {
            exec(`start "" "${reportPath}"`);
        } else {
            exec(`xdg-open "${reportPath}"`);
        }
    } catch (e) {
        console.error('Error during shutdown:', e);
    } finally {
        if (!rl.closed) {
            rl.close();
        }
        process.exit();
    }
}

// Handle interrupts
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

main().catch(console.error);