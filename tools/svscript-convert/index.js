require('dotenv').config({ path: '../../.env' });
const { google } = require('googleapis');
const fs = require('fs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Will store unmatched keys for reporting
const unmatchedKeys = {
    actors: [],
    quests: [],
    dialogues: [],
    system: []
};

async function withRetry(operation, maxRetries = 50, initialDelay = 1000) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (error.message.includes('Quota exceeded')) {
                const delay = initialDelay * Math.pow(2, attempt);
                console.log(`Rate limit hit. Waiting ${delay / 1000} seconds before retry ${attempt + 1}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error; // If it's not a quota error, throw it immediately
            }
        }
    }
    throw new Error(`Failed after ${maxRetries} retries`);
}

async function getAuthClient() {
    const credentials = JSON.parse(
        fs.readFileSync('../../' + process.env.GOOGLE_CREDENTIALS_FILE, 'utf8')
    );

    return new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
}

async function loadColumnData(sheets, spreadsheetId, sheet, column) {
    return withRetry(async () => {
        const range = `${sheet}!${column}:${column}`;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        return response.data.values
            ?.slice(1)
            ?.map(row => row[0])
            ?.filter(Boolean) || [];
    });
}

async function loadKeyValuePairs(sheets, spreadsheetId, sheet) {
    return withRetry(async () => {
        const range = `${sheet}!A:F`;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
        });

        const pairs = new Map();
        if (response.data.values) {
            for (let i = 1; i < response.data.values.length; i++) {
                const row = response.data.values[i];
                if (row[0] && row[5]) {
                    pairs.set(row[0], {
                        value: row[5],
                        rowIndex: i + 1
                    });
                }
            }
        }
        return pairs;
    });
}

async function getCellFormatting(sheets, spreadsheetId, sheet, rowIndex, column) {
    return withRetry(async () => {
        const response = await sheets.spreadsheets.get({
            spreadsheetId,
            ranges: [`${sheet}!${column}${rowIndex}`],
            fields: 'sheets.data.rowData.values.userEnteredFormat.backgroundColor,sheets.data.rowData.values.note'
        });

        if (!response.data.sheets?.[0]?.data?.[0]?.rowData?.[0]?.values?.[0]) {
            return null;
        }

        const cell = response.data.sheets[0].data[0].rowData[0].values[0];
        return {
            backgroundColor: cell.userEnteredFormat?.backgroundColor || null,
            note: cell.note || null
        };
    });
}

async function writeDataWithFormatting(sheets, spreadsheetId, sheet, column, rowIndex, value, formatting) {
    return withRetry(async () => {
        const range = `${sheet}!${column}${rowIndex}`;

        // Update value
        await sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'RAW',
            requestBody: {
                values: [[value]]
            }
        });

        if (formatting) {
            const requests = [];
            const columnIndex = column.charCodeAt(0) - 'A'.charCodeAt(0);

            if (formatting.backgroundColor) {
                requests.push({
                    repeatCell: {
                        range: {
                            sheetId: await getSheetId(sheets, spreadsheetId, sheet),
                            startRowIndex: rowIndex - 1,
                            endRowIndex: rowIndex,
                            startColumnIndex: columnIndex,
                            endColumnIndex: columnIndex + 1
                        },
                        cell: {
                            userEnteredFormat: {
                                backgroundColor: formatting.backgroundColor
                            }
                        },
                        fields: 'userEnteredFormat.backgroundColor'
                    }
                });
            }

            if (formatting.note) {
                requests.push({
                    repeatCell: {
                        range: {
                            sheetId: await getSheetId(sheets, spreadsheetId, sheet),
                            startRowIndex: rowIndex - 1,
                            endRowIndex: rowIndex,
                            startColumnIndex: columnIndex,
                            endColumnIndex: columnIndex + 1
                        },
                        cell: {
                            note: formatting.note
                        },
                        fields: 'note'
                    }
                });
            }

            if (requests.length > 0) {
                await sheets.spreadsheets.batchUpdate({
                    spreadsheetId,
                    requestBody: {
                        requests
                    }
                });
            }
        }
    });
}

async function getSheetId(sheets, spreadsheetId, sheetName) {
    return withRetry(async () => {
        const response = await sheets.spreadsheets.get({
            spreadsheetId,
            fields: 'sheets.properties'
        });

        const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
        return sheet?.properties?.sheetId;
    });
}

function transformDialogueKey(oldKey, newKey) {
    // Old format: Dialogue System/Conversation/Apartment.Phase1.BBF_FirstTalk/Entry/26/Menu Text
    // New format: Dialogue/Apartment/Phase1/BBF_FirstTalk/26/MenuText

    // First, let's normalize both keys for comparison
    const normalizedOldKey = oldKey
        .replace('Dialogue System/Conversation/', 'Dialogue/') // Replace the prefix
        .replace('/Entry/', '/') // Remove 'Entry'
        .replace(/\./g, '/') // Replace all dots with slashes
        .replace('Menu Text', 'MenuText')
        .replace('Dialogue Text', 'DialogueText')
        .replace(/ /g, ''); // Remove any remaining spaces

    const normalizedNewKey = newKey
        .replace(/ /g, ''); // Remove any spaces, just in case

    return normalizedOldKey === normalizedNewKey;
}

function transformActorKey(actorKey) {
    return `Dialogue System/${actorKey}/Display Name`;
}

function transformQuestKey(questKey) {
    return `Dialogue System/Item-${questKey}/Description`;
}

function transformSystemKey(systemKey) {
    return systemKey.replace('System/', '');
}

async function main() {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });
    const NEW = process.env.SPREADSHEET_ID;
    const OLD = process.env.SV_SPREADSHEET_ID;
    if (!OLD) {
        console.error(`SV_SPREADSHEET_ID is not defined.`);
        process.exit(1);
    }

    // Load all keys from NEW
    console.log('Loading keys from NEW spreadsheet...');
    const actorKeys = await loadColumnData(sheets, NEW, 'Actors', 'A');
    const questKeys = await loadColumnData(sheets, NEW, 'Quests', 'A');
    const dialogueKeys = await loadColumnData(sheets, NEW, 'Dialogues', 'A');
    const systemKeys = await loadColumnData(sheets, NEW, 'System', 'A');

    // Load data from OLD
    console.log('Loading data from OLD spreadsheet...');
    const mixedData = await loadKeyValuePairs(sheets, OLD, 'Dialogue');
    const systemData = await loadKeyValuePairs(sheets, OLD, 'System');

    // Process Actors
    console.log('Processing Actors...');
    for (let i = 0; i < actorKeys.length; i++) {
        const key = actorKeys[i];
        const oldKey = transformActorKey(key);
        const data = mixedData.get(oldKey);

        if (data) {
            const formatting = await getCellFormatting(sheets, OLD, 'Dialogue', data.rowIndex, 'F');
            await writeDataWithFormatting(sheets, NEW, 'Actors', 'C', i + 2, data.value, formatting);
        } else {
            unmatchedKeys.actors.push(key);
        }
    }

    // Process Quests
    console.log('Processing Quests...');
    for (let i = 0; i < questKeys.length; i++) {
        const key = questKeys[i];
        const oldKey = transformQuestKey(key);
        const data = mixedData.get(oldKey);

        if (data) {
            const formatting = await getCellFormatting(sheets, OLD, 'Dialogue', data.rowIndex, 'F');
            await writeDataWithFormatting(sheets, NEW, 'Quests', 'C', i + 2, data.value, formatting);
        } else {
            unmatchedKeys.quests.push(key);
        }
        await delay(100);
    }

    // Process System
    console.log('Processing System...');
    for (let i = 0; i < systemKeys.length; i++) {
        const key = systemKeys[i];
        const oldKey = transformSystemKey(key);
        const data = systemData.get(oldKey);

        if (data) {
            const formatting = await getCellFormatting(sheets, OLD, 'System', data.rowIndex, 'F');
            await writeDataWithFormatting(sheets, NEW, 'System', 'C', i + 2, data.value, formatting);
        } else {
            unmatchedKeys.system.push(key);
        }
        await delay(100);
    }

    // Process Dialogues
    console.log('Processing Dialogues...');
    for (let i = 0; i < dialogueKeys.length; i++) {
        const newKey = dialogueKeys[i];
        let found = false;

        for (const [oldKey, data] of mixedData.entries()) {
            if (transformDialogueKey(oldKey, newKey)) {
                const formatting = await getCellFormatting(sheets, OLD, 'Dialogue', data.rowIndex, 'F');
                await writeDataWithFormatting(sheets, NEW, 'Dialogues', 'D', i + 2, data.value, formatting);
                found = true;
                break;
            }
        }

        if (!found) {
            unmatchedKeys.dialogues.push(newKey);
        }
        await delay(100);
    }

    // Report unmatched keys
    console.log('\nUnmatched keys report:');

    if (unmatchedKeys.actors.length > 0) {
        console.log('\nActors:');
        unmatchedKeys.actors.forEach(key => console.log(key));
    }

    if (unmatchedKeys.quests.length > 0) {
        console.log('\nQuests:');
        unmatchedKeys.quests.forEach(key => console.log(key));
    }

    if (unmatchedKeys.system.length > 0) {
        console.log('\nSystem:');
        unmatchedKeys.system.forEach(key => console.log(key));
    }

    if (unmatchedKeys.dialogues.length > 0) {
        console.log('\nDialogues:');
        unmatchedKeys.dialogues.forEach(key => console.log(key));
    }

    console.log('\nOperation completed!');
}

// Execute the script
main().catch(error => {
    console.error('Error occurred:', error);
    process.exit(1);
});