const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

class ThousandXspreadsheeT {
    constructor(config) {
        this.storageType = config.STORAGE;
        this.sheetNames = {
            actors: config.ACTORS_SHEET_NAME,
            quests: config.QUESTS_SHEET_NAME,
            system: config.SYSTEM_SHEET_NAME,
            dialogues: config.DIALOGUES_SHEET_NAME,
            strings: config.STRINGS_SHEET_NAME
        };

        if (this.storageType === 'GOOGLE') {
            // Initialize Google Sheets
            const credentials = JSON.parse(fs.readFileSync(config.GOOGLE_CREDENTIALS_FILE));
            const auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            this.sheets = google.sheets({ version: 'v4', auth });
            this.spreadsheetId = config.SPREADSHEET_ID;
        } else {
            // Initialize local file storage
            this.filePath = this.storageType;
            this.templatePath = path.join(__dirname, '1000xTRANSLATE.xlsx');
            this.workbook = null;
            this.#initializeLocalFile();
        }
    }

    #initializeLocalFile() {
        // Check if the file exists, if not copy the template
        if (!fs.existsSync(this.filePath)) {
            if (!fs.existsSync(this.templatePath)) {
                throw new Error(`Template file not found: ${this.templatePath}`);
            }
            fs.copyFileSync(this.templatePath, this.filePath);
            console.log(`Created new spreadsheet file: ${this.filePath}`);
        }
    }

    async #ensureWorkbookLoaded() {
        if (this.storageType !== 'GOOGLE') {
            // Prevent multiple simultaneous loads
            if (this._loadingPromise) {
                await this._loadingPromise;
                return;
            }
            
            if (!this.workbook) {
                this._loadingPromise = (async () => {
                    this.workbook = new ExcelJS.Workbook();
                    await this.workbook.xlsx.readFile(this.filePath);
                })();
                
                await this._loadingPromise;
                this._loadingPromise = null;
            }
        }
    }

    async #saveWorkbook() {
        if (this.storageType !== 'GOOGLE' && this.workbook) {
            await this.workbook.xlsx.writeFile(this.filePath);
        }
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
        if (this.storageType === 'GOOGLE') {
            const endColumn = columns.split(':')[1];
            const range = `${sheetName}!A2:${endColumn}`;
            const response = await this.#executeWithRetry(() =>
                this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.spreadsheetId,
                    range
                })
            );
            return response.data.values || [];
        } else {
            return await this.#getLocalSheetData(sheetName, columns);
        }
    }

    async #getLocalSheetData(sheetName, columns) {
        await this.#ensureWorkbookLoaded();
        
        const worksheet = this.workbook.getWorksheet(sheetName);
        if (!worksheet) {
            console.warn(`Worksheet '${sheetName}' not found`);
            return [];
        }

        const endColumn = columns.split(':')[1];
        const endColumnIndex = this.#columnLetterToIndex(endColumn);
        const rows = [];

        // Start from row 2 (skip header)
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > 1) {
                const rowData = [];
                for (let col = 1; col <= endColumnIndex; col++) {
                    const cell = row.getCell(col);
                    rowData.push(cell.value ? String(cell.value) : '');
                }
                rows.push(rowData);
            }
        });

        return rows;
    }

    #columnLetterToIndex(letter) {
        let result = 0;
        for (let i = 0; i < letter.length; i++) {
            result = result * 26 + (letter.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
        }
        return result;
    }

    #indexToColumnLetter(index) {
        let result = '';
        while (index > 0) {
            index--;
            result = String.fromCharCode('A'.charCodeAt(0) + (index % 26)) + result;
            index = Math.floor(index / 26);
        }
        return result;
    }

    async #appendRows(sheetName, rows) {
        if (rows.length === 0) return;

        if (this.storageType === 'GOOGLE') {
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
        } else {
            await this.#appendLocalRows(sheetName, rows);
        }
    }

    async #appendLocalRows(sheetName, rows) {
        await this.#ensureWorkbookLoaded();
        
        const worksheet = this.workbook.getWorksheet(sheetName);
        if (!worksheet) {
            console.warn(`Worksheet '${sheetName}' not found`);
            return;
        }

        // Find the last row with data
        let lastRow = 1; // Start after header
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber > lastRow) {
                lastRow = rowNumber;
            }
        });

        // Append new rows
        rows.forEach((rowData, index) => {
            const newRowNumber = lastRow + index + 1;
            const row = worksheet.getRow(newRowNumber);
            rowData.forEach((cellValue, colIndex) => {
                row.getCell(colIndex + 1).value = cellValue;
            });
            row.commit();
        });

        await this.#saveWorkbook();
    }

    async #updateRows(sheetName, updates) {
        if (updates.length === 0) return;

        if (this.storageType === 'GOOGLE') {
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
        } else {
            await this.#updateLocalRows(sheetName, updates);
        }
    }

    async #updateLocalRows(sheetName, updates) {
        await this.#ensureWorkbookLoaded();
        
        const worksheet = this.workbook.getWorksheet(sheetName);
        if (!worksheet) {
            console.warn(`Worksheet '${sheetName}' not found`);
            return;
        }

        updates.forEach(update => {
            const range = update.range;
            const values = update.values;
            
            // Parse range like "B2:C2" or "B2"
            const [startCell, endCell] = range.split(':');
            const startMatch = startCell.match(/([A-Z]+)(\d+)/);
            if (!startMatch) return;
            
            const startCol = this.#columnLetterToIndex(startMatch[1]);
            const startRow = parseInt(startMatch[2]);
            
            // Update cells
            values.forEach((value, index) => {
                const cell = worksheet.getCell(startRow, startCol + index);
                cell.value = value;
            });
        });

        await this.#saveWorkbook();
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
        const sheetName = `VOCAB-${vocabName}`;
        return this.#getKeyValueData(sheetName);
    }

    async appendVocab(vocabName, strings) {
        const sheetName = `VOCAB-${vocabName}`;
        await this.#appendKeyValueData(sheetName, strings);
    }

    async replaceVocab(vocabName, strings) {
        const sheetName = `VOCAB-${vocabName}`;
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

        if (this.storageType === 'GOOGLE') {
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
        } else {
            await this.#markLocalDialogues(keys, color, field);
        }
    }

    async #markLocalDialogues(keys, color, field) {
        // For local storage, we skip applying formatting to preserve existing file formatting
        // This is a no-op for local files - formatting is only applied for Google Sheets
        return;
    }

}

module.exports = ThousandXspreadsheeT;