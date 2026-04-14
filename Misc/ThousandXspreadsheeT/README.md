# ThousandXspreadsheeT

A Node.js class for managing translations and vocabulary in Google Spreadsheets or local `.xlsx` files.

(yeah it's all LLM-generated)

## Installation

```bash
npm install googleapis exceljs
```

## Usage

The class supports two storage backends, controlled by the `STORAGE` config key.

### Google Sheets

```javascript
const ThousandXspreadsheeT = require('./ThousandXspreadsheeT');

const spreadsheet = new ThousandXspreadsheeT({
    STORAGE: 'GOOGLE',
    GOOGLE_CREDENTIALS_FILE: '../path/to/credentials.json',
    SPREADSHEET_ID: 'your-spreadsheet-id',
    ACTORS_SHEET_NAME: 'Actors',
    QUESTS_SHEET_NAME: 'Quests',
    SYSTEM_SHEET_NAME: 'System',
    STRINGS_SHEET_NAME: 'Strings',
    DIALOGUES_SHEET_NAME: 'Dialogues'
});
```

### Local `.xlsx` File

Set `STORAGE` to a file path instead of `'GOOGLE'`. If the file doesn't exist, it will be created from the bundled template.

```javascript
const spreadsheet = new ThousandXspreadsheeT({
    STORAGE: './translations.xlsx',
    ACTORS_SHEET_NAME: 'Actors',
    QUESTS_SHEET_NAME: 'Quests',
    SYSTEM_SHEET_NAME: 'System',
    STRINGS_SHEET_NAME: 'Strings',
    DIALOGUES_SHEET_NAME: 'Dialogues'
});
```

> **Important:** When using local storage, call `commit()` after all write operations to persist changes to disk.

## Methods

### `commit()`

Saves pending changes to the local `.xlsx` file. This is a no-op for Google Sheets (changes are written immediately).

```javascript
await spreadsheet.commit();
```

Must be called after any write operations when using local file storage.

---

### Vocabulary Methods

Vocabulary sheets are named `VOCAB-{vocabName}` and store simple key/value pairs.

```javascript
// Get all vocabulary entries
const vocab = await spreadsheet.getVocab('vocab_name');
// Returns: { "key1": "value1", "key2": "value2" }

// Add new entries
await spreadsheet.appendVocab('vocab_name', {
    "key3": "value3",
    "key4": "value4"
});

// Update existing entries or add new ones
await spreadsheet.replaceVocab('vocab_name', {
    "key1": "new_value1",  // updates existing
    "key5": "value5"       // adds new
});
```

---

### Strings Methods

The Strings sheet stores simple key/value pairs, similar to vocabulary but in a dedicated fixed sheet.

```javascript
// Get all string entries
const strings = await spreadsheet.getStrings();
// Returns: { "key1": "value1", "key2": "value2" }

// Add new entries
await spreadsheet.appendStrings({
    "key3": "value3"
});

// Update existing entries or add new ones
await spreadsheet.replaceStrings({
    "key1": "new_value1",  // updates existing
    "key5": "value5"       // adds new
});
```

---

### Actors, Quests, and System Methods

These three categories share the same three-column structure (`key`, `original`, `translated`):

```javascript
// Get all entries
const actors = await spreadsheet.getActors();
// Returns: {
//     "actor1": {
//         "original": "Hello",
//         "translated": "Привет"
//     }
// }

// Add new entries
await spreadsheet.appendActors({
    "actor2": {
        "original": "Goodbye",
        "translated": "Пока"
    }
});

// Update existing entries or add new ones
await spreadsheet.replaceActors({
    "actor1": {
        "translated": "Хелло" // updates only translated field
    },
    "actor3": {              // adds new entry
        "original": "Thanks",
        "translated": "Спасибо"
    }
});
```

Same methods are available for Quests (`getQuests`, `appendQuests`, `replaceQuests`) and System (`getSystem`, `appendSystem`, `replaceSystem`).

---

### Dialogue Methods

```javascript
// Get all dialogues
const dialogues = await spreadsheet.getDialogues();
// Returns: {
//     "dialogue1": {
//         "actor": "John",
//         "original": "Hello there!",
//         "translated": "Привет!"
//     }
// }

// Add new dialogues
await spreadsheet.appendDialogues({
    "dialogue2": {
        "actor": "Mary",
        "original": "Hi John!",
        "translated": "Привет, Джон!"
    }
});

// Update existing dialogues or add new ones
await spreadsheet.replaceDialogues({
    "dialogue1": {
        "translated": "Здравствуй!" // updates only translated field
    }
});

// Color specific dialogue cells (Google Sheets only, no-op for local storage)
await spreadsheet.markDialogues(
    ['dialogue1', 'dialogue2'], // keys to mark
    '#ff0000',                 // color in hex format
    'original'                 // field to color ('original' or 'translated')
);
```

---

## Notes

- All methods perform case-insensitive key matching
- When updating entries, only provided fields are modified
- First row in all sheets is considered a header and is not processed
- For Google Sheets, all write operations are applied immediately; no caching is performed
- For local storage, changes are buffered in memory and must be flushed with `commit()`
- `markDialogues()` is a no-op when using local file storage
- All operations are asynchronous and return promises

## Error Handling

The class will throw errors in cases such as:
- Invalid Google credentials
- Sheet not found
- Permission denied
- Invalid spreadsheet ID
- Missing template file (local storage, first run)

It's recommended to wrap operations in try-catch blocks when needed.
