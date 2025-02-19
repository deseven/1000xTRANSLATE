const { google } = require('googleapis');
const fs = require('fs');

class ThousandXspreadsheeT {
    constructor(config) {
        const credentials = JSON.parse(fs.readFileSync(config.GOOGLE_CREDENTIALS_FILE));
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        this.sheets = google.sheets({ version: 'v4', auth });
        this.spreadsheetId = config.SPREADSHEET_ID;
        this.sheetNames = {
            actors: config.ACTORS_SHEET_NAME,
            quests: config.QUESTS_SHEET_NAME,
            system: config.SYSTEM_SHEET_NAME,
            dialogues: config.DIALOGUES_SHEET_NAME
        };
    }

    async #getSheetData(sheetName, columns) {
        // If columns is "A:C", this will create a range like "Actors!A2:C"
        const endColumn = columns.split(':')[1];
        const range = `${sheetName}!A2:${endColumn}`;
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range
        });
        return response.data.values || [];
    }

    async #appendRows(sheetName, rows) {
        if (rows.length === 0) return;
    
        // First, append the rows
        const appendResponse = await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range: `${sheetName}!A:D`,
            valueInputOption: 'USER_ENTERED',
            insertDataOption: 'INSERT_ROWS',
            requestBody: {
                values: rows
            }
        });
    
        // Get the sheet ID
        const sheetId = await this.#getSheetId(sheetName);
        
        // Get the range where rows were inserted
        const updatedRange = appendResponse.data.updates.updatedRange;
        const [startRow, endRow] = updatedRange.match(/\d+/g).map(Number);
    
        // Clear formatting for the inserted rows
        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: {
                requests: [{
                    repeatCell: {
                        range: {
                            sheetId: sheetId,
                            startRowIndex: startRow - 1,  // Convert to 0-based index
                            endRowIndex: endRow,          // Convert to 0-based index
                            startColumnIndex: 0,
                            endColumnIndex: 4             // A through D
                        },
                        cell: {
                            userEnteredFormat: {
                                backgroundColor: { red: 1, green: 1, blue: 1 },  // White
                                textFormat: {
                                    fontSize: 10,
                                    bold: false
                                }
                            }
                        },
                        fields: 'userEnteredFormat(backgroundColor,textFormat)'
                    }
                }]
            }
        });
    
        return appendResponse;
    }

    async #updateRows(sheetName, updates) {
        if (updates.length === 0) return;
    
        const response = await this.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: updates.map(update => ({
                    range: `${sheetName}!${update.range}`,
                    values: [update.values]
                }))
            }
        });
        return response;
    }

    async #getSheetId(sheetName) {
        const response = await this.sheets.spreadsheets.get({
            spreadsheetId: this.spreadsheetId,
            fields: 'sheets.properties'
        });

        const sheet = response.data.sheets.find(s =>
            s.properties.title === sheetName
        );
        return sheet?.properties?.sheetId;
    }

    #hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        return { red: r, green: g, blue: b };
    }

    // Vocab methods
    async getVocab(vocabName) {
        const sheetName = `VOCAB:${vocabName}`;
        const rows = await this.#getSheetData(sheetName, 'A:B');

        return rows.reduce((acc, [key, value]) => {
            if (key) acc[key] = value || '';
            return acc;
        }, {});
    }

    async appendVocab(vocabName, strings) {
        const sheetName = `VOCAB:${vocabName}`;
        const rows = Object.entries(strings).map(([key, value]) => [key, value]);
        await this.#appendRows(sheetName, rows);
    }

    async replaceVocab(vocabName, strings) {
        const sheetName = `VOCAB:${vocabName}`;
        const existing = await this.getVocab(vocabName);
        const updates = [];
        const toAppend = {};

        for (const [key, value] of Object.entries(strings)) {
            const existingKey = Object.keys(existing).find(k => k.toLowerCase() === key.toLowerCase());
            if (existingKey !== undefined) {
                if (value != null) {
                    const rowIndex = Object.keys(existing).indexOf(existingKey) + 2;
                    updates.push({
                        range: `B${rowIndex}`,
                        values: [value]
                    });
                }
            } else {
                toAppend[key] = key;
            }
        }

        await this.#updateRows(sheetName, updates);
        if (Object.keys(toAppend).length > 0) {
            await this.appendVocab(vocabName, toAppend);
        }
    }

    // Helper for getting three-column data (Actors, Quests, System)
    async #getThreeColumnData(sheetName) {
        const rows = await this.#getSheetData(sheetName, 'A:C');

        return rows.reduce((acc, [key, original, translated]) => {
            if (key) {
                acc[key] = {
                    original: original || '',
                    translated: translated || ''
                };
            }
            return acc;
        }, {});
    }

    // Helper for replacing three-column data
    async #replaceThreeColumnData(sheetName, strings) {
        const existing = await this.#getThreeColumnData(sheetName);
        const updates = [];
        const toAppend = {};

        for (const [key, data] of Object.entries(strings)) {
            const existingKey = Object.keys(existing).find(k => k.toLowerCase() === key.toLowerCase());
            if (existingKey !== undefined) {
                const rowIndex = Object.keys(existing).indexOf(existingKey) + 2;
                if (data.original != null || data.translated != null) {
                    const updateRow = [
                        data.original != null ? data.original : existing[existingKey].original,
                        data.translated != null ? data.translated : existing[existingKey].translated
                    ];
                    updates.push({
                        range: `B${rowIndex}:C${rowIndex}`,
                        values: updateRow
                    });
                }
            } else {
                toAppend[key] = data;
            }
        }

        await this.#updateRows(sheetName, updates);
        if (Object.keys(toAppend).length > 0) {
            await this.#appendThreeColumnData(sheetName, toAppend);
        }
    }

    // Helper for appending three-column data
    async #appendThreeColumnData(sheetName, strings) {
        const rows = Object.entries(strings).map(([key, data]) => [
            key,
            data.original || '',
            data.translated || ''
        ]);
        await this.#appendRows(sheetName, rows);
    }

    // Actors methods
    async getActors() {
        return this.#getThreeColumnData(this.sheetNames.actors);
    }

    async appendActors(strings) {
        await this.#appendThreeColumnData(this.sheetNames.actors, strings);
    }

    async replaceActors(strings) {
        await this.#replaceThreeColumnData(this.sheetNames.actors, strings);
    }

    // Quests methods
    async getQuests() {
        return this.#getThreeColumnData(this.sheetNames.quests);
    }

    async appendQuests(strings) {
        await this.#appendThreeColumnData(this.sheetNames.quests, strings);
    }

    async replaceQuests(strings) {
        await this.#replaceThreeColumnData(this.sheetNames.quests, strings);
    }

    // System methods
    async getSystem() {
        return this.#getThreeColumnData(this.sheetNames.system);
    }

    async appendSystem(strings) {
        await this.#appendThreeColumnData(this.sheetNames.system, strings);
    }

    async replaceSystem(strings) {
        await this.#replaceThreeColumnData(this.sheetNames.system, strings);
    }

    // Dialogues methods
    async getDialogues() {
        const rows = await this.#getSheetData(this.sheetNames.dialogues, 'A:D');

        return rows.reduce((acc, [key, actor, original, translated]) => {
            if (key) {
                acc[key] = {
                    actor: actor || '',
                    original: original || '',
                    translated: translated || ''
                };
            }
            return acc;
        }, {});
    }

    async appendDialogues(strings) {
        const rows = Object.entries(strings).map(([key, data]) => [
            key,
            data.actor || '',
            data.original || '',
            data.translated || ''
        ]);
        await this.#appendRows(this.sheetNames.dialogues, rows);
    }

    async replaceDialogues(strings) {
        const existing = await this.getDialogues();
        const updates = [];
        const toAppend = {};

        for (const [key, data] of Object.entries(strings)) {
            const existingKey = Object.keys(existing).find(k => k.toLowerCase() === key.toLowerCase());
            if (existingKey !== undefined) {
                const rowIndex = Object.keys(existing).indexOf(existingKey) + 2;
                if (data.actor != null || data.original != null || data.translated != null) {
                    const updateRow = [
                        data.actor != null ? data.actor : existing[existingKey].actor,
                        data.original != null ? data.original : existing[existingKey].original,
                        data.translated != null ? data.translated : existing[existingKey].translated
                    ];
                    updates.push({
                        range: `B${rowIndex}:D${rowIndex}`,
                        values: updateRow
                    });
                }
            } else {
                toAppend[key] = data;
            }
        }

        await this.#updateRows(this.sheetNames.dialogues, updates);
        if (Object.keys(toAppend).length > 0) {
            await this.appendDialogues(toAppend);
        }
    }

    async markDialogues(keys, color, field) {
        if (keys.length === 0) return;

        // Get the sheet ID (needed for formatting requests)
        const sheetId = await this.#getSheetId(this.sheetNames.dialogues);
        if (!sheetId) throw new Error('Dialogues sheet not found');

        // Get existing dialogues to find row numbers
        const dialogues = await this.getDialogues();

        // Determine which column to color (0-based index)
        const columnIndex = field === 'original' ? 2 : 3;

        // Create formatting requests for each found key
        const requests = keys.map(key => {
            const existingKey = Object.keys(dialogues).find(
                k => k.toLowerCase() === key.toLowerCase()
            );
            if (!existingKey) return null;

            // Calculate row index (0-based, accounting for header)
            const rowIndex = Object.keys(dialogues).indexOf(existingKey) + 1;

            return {
                updateCells: {
                    range: {
                        sheetId: sheetId,
                        startRowIndex: rowIndex,
                        endRowIndex: rowIndex + 1,
                        startColumnIndex: columnIndex,
                        endColumnIndex: columnIndex + 1
                    },
                    rows: [{
                        values: [{
                            userEnteredFormat: {
                                backgroundColor: this.#hexToRgb(color)
                            }
                        }]
                    }],
                    fields: 'userEnteredFormat.backgroundColor'
                }
            };
        }).filter(Boolean); // Remove null entries for keys that weren't found

        if (requests.length > 0) {
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: { requests }
            });
        }
    }
}

module.exports = ThousandXspreadsheeT;