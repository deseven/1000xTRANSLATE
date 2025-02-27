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
            dialogues: config.DIALOGUES_SHEET_NAME,
            strings: config.STRINGS_SHEET_NAME
        };
    }

    async #executeWithRetry(requestFn) {
        const maxTries = 10;
        for (let attempt = 1; attempt <= maxTries; attempt++) {
            try {
                return await requestFn();
            } catch (error) {
                if (this.#isQuotaError(error)) {
                    if (attempt === maxTries) {
                        console.warn('Max retries reached for quota exceeded error. Giving up.');
                        throw error;
                    }
                    const delayMs = 1000 * Math.pow(2, attempt - 1);
                    console.warn(`Quota exceeded. Retrying in ${delayMs}ms (attempt ${attempt}/${maxTries})`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                } else {
                    throw error;
                }
            }
        }
    }

    #isQuotaError(error) {
        return error.response &&
            (error.response.status === 429 || error.response.status === 403) &&
            error.message.includes('Quota exceeded');
    }

    async #getSheetData(sheetName, columns) {
        const endColumn = columns.split(':')[1];
        const range = `${sheetName}!A2:${endColumn}`;
        const response = await this.#executeWithRetry(() => 
            this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range
            })
        );
        return response.data.values || [];
    }

    async #appendRows(sheetName, rows) {
        if (rows.length === 0) return;
    
        const appendResponse = await this.#executeWithRetry(() => 
            this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!A:D`,
                valueInputOption: 'USER_ENTERED',
                insertDataOption: 'INSERT_ROWS',
                requestBody: {
                    values: rows
                }
            })
        );

        const sheetId = await this.#getSheetId(sheetName);
        const updatedRange = appendResponse.data.updates.updatedRange;
        const [startRow, endRow] = updatedRange.match(/\d+/g).map(Number);

        await this.#executeWithRetry(() =>
            this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: {
                    requests: [{
                        repeatCell: {
                            range: {
                                sheetId: sheetId,
                                startRowIndex: startRow - 1,
                                endRowIndex: endRow,
                                startColumnIndex: 0,
                                endColumnIndex: 4
                            },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: { red: 1, green: 1, blue: 1 },
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
            })
        );

        return appendResponse;
    }

    async #updateRows(sheetName, updates) {
        if (updates.length === 0) return;
    
        const response = await this.#executeWithRetry(() =>
            this.sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: {
                    valueInputOption: 'USER_ENTERED',
                    data: updates.map(update => ({
                        range: `${sheetName}!${update.range}`,
                        values: [update.values]
                    }))
                }
            })
        );
        return response;
    }

    async #getSheetId(sheetName) {
        const response = await this.#executeWithRetry(() =>
            this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId,
                fields: 'sheets.properties'
            })
        );

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

    async #getKeyValueData(sheetName) {
        const rows = await this.#getSheetData(sheetName, 'A:B');
        return rows.reduce((acc, [key, value]) => {
            if (key) acc[key] = value || '';
            return acc;
        }, {});
    }

    async #appendKeyValueData(sheetName, strings) {
        const rows = Object.entries(strings).map(([key, value]) => [key, value]);
        await this.#appendRows(sheetName, rows);
    }

    async #replaceKeyValueData(sheetName, strings) {
        const existing = await this.#getKeyValueData(sheetName);
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
                toAppend[key] = value;
            }
        }

        await this.#updateRows(sheetName, updates);
        if (Object.keys(toAppend).length > 0) {
            await this.#appendKeyValueData(sheetName, toAppend);
        }
    }

    async getVocab(vocabName) {
        const sheetName = `VOCAB:${vocabName}`;
        return this.#getKeyValueData(sheetName);
    }

    async appendVocab(vocabName, strings) {
        const sheetName = `VOCAB:${vocabName}`;
        await this.#appendKeyValueData(sheetName, strings);
    }

    async replaceVocab(vocabName, strings) {
        const sheetName = `VOCAB:${vocabName}`;
        await this.#replaceKeyValueData(sheetName, strings);
    }

    async getStrings() {
        return this.#getKeyValueData(this.sheetNames.strings);
    }

    async appendStrings(strings) {
        await this.#appendKeyValueData(this.sheetNames.strings, strings);
    }

    async replaceStrings(strings) {
        await this.#replaceKeyValueData(this.sheetNames.strings, strings);
    }

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

    async #appendThreeColumnData(sheetName, strings) {
        const rows = Object.entries(strings).map(([key, data]) => [
            key,
            data.original || '',
            data.translated || ''
        ]);
        await this.#appendRows(sheetName, rows);
    }

    async getActors() {
        return this.#getThreeColumnData(this.sheetNames.actors);
    }

    async appendActors(strings) {
        await this.#appendThreeColumnData(this.sheetNames.actors, strings);
    }

    async replaceActors(strings) {
        await this.#replaceThreeColumnData(this.sheetNames.actors, strings);
    }

    async getQuests() {
        return this.#getThreeColumnData(this.sheetNames.quests);
    }

    async appendQuests(strings) {
        await this.#appendThreeColumnData(this.sheetNames.quests, strings);
    }

    async replaceQuests(strings) {
        await this.#replaceThreeColumnData(this.sheetNames.quests, strings);
    }

    async getSystem() {
        return this.#getThreeColumnData(this.sheetNames.system);
    }

    async appendSystem(strings) {
        await this.#appendThreeColumnData(this.sheetNames.system, strings);
    }

    async replaceSystem(strings) {
        await this.#replaceThreeColumnData(this.sheetNames.system, strings);
    }

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

        const sheetId = await this.#getSheetId(this.sheetNames.dialogues);
        if (!sheetId) throw new Error('Dialogues sheet not found');

        const dialogues = await this.getDialogues();
        const columnIndex = field === 'original' ? 2 : 3;

        const requests = keys.map(key => {
            const existingKey = Object.keys(dialogues).find(
                k => k.toLowerCase() === key.toLowerCase()
            );
            if (!existingKey) return null;

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
        }).filter(Boolean);

        if (requests.length > 0) {
            await this.#executeWithRetry(() =>
                this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    requestBody: { requests }
                })
            );
        }
    }
}

module.exports = ThousandXspreadsheeT;