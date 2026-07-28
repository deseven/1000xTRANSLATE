// Sorts the dialogue keys that are already in the storage (Google Sheet or xlsx)
// into the natural conversation order (following outgoing links from each
// conversation's START node), instead of the raw numeric id order.
//
// - rows are physically moved, so user notes/comments/color fills stay attached;
// - keys that can't be found in the exported dialogue databases keep their
//   relative order and stay at the end of their current block;
// - usage: `npm run tool:sort-dialogues` (or `npm run tool:sort-dialogues-dry-run`)
//   --dry-run only reports how many rows would be moved, without touching the storage.

const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const ThousandXspreadsheeT = require('../ThousandXspreadsheeT');
const { orderConversationEntries, buildTargetOrder, computeMoves } = require('../dialogue-order');

const DRY_RUN = process.argv.includes('--dry-run');

dotenv.config({ path: '.env' });
const resDir = path.isAbsolute(process.env.RES_DIR)
    ? process.env.RES_DIR
    : path.join(__dirname, '../../', process.env.RES_DIR);

const logPath = path.join(__dirname, '..', '..', 'Logs', 'sort-dialogues.log');
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, '');

function log(message) {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
}

const chapterDefinitions = JSON.parse(fs.readFileSync(path.join(__dirname, '../../Data/chapter-definitions.json'), 'utf-8'));

// same file discovery rules as the sheetifier
function getAllJsonFiles(dir, files = []) {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
            getAllJsonFiles(fullPath, files);
        } else if (
            path.extname(fullPath).toLowerCase() === '.json' &&
            path.basename(fullPath) !== 'I2Languages.json' &&
            path.basename(fullPath) !== 'strings.json' &&
            !path.basename(fullPath).startsWith('parsed_') &&
            !fullPath.endsWith('-mod.json')
        ) {
            files.push(fullPath);
        }
    });
    return files;
}

// Builds the naturally ordered list of all dialogue keys
// (Dialogue/<conversation>/<entryId>/MenuText|DialogueText), replicating the
// sheetifier's global ordering: chapter number first (stable), then file order,
// then conversation order, then the natural entry order within a conversation.
function buildRankedKeys() {
    const jsonFiles = getAllJsonFiles(resDir);
    const entries = []; // { key, chapter }

    jsonFiles.forEach(file => {
        let data;
        try {
            data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        } catch (err) {
            log(`Warning: unable to parse ${file}: ${err}`);
            return;
        }
        if (!data.conversations?.length) return;

        // chapter detection, same as the sheetifier (first matching conversation wins)
        let chapter = null;
        data.conversations.forEach(conversation => {
            const titleField = conversation.fields?.find(f =>
                f.type === 0 && f.title.toLowerCase() === 'title'
            );
            const convTitle = titleField?.value || '';
            if (chapter === null) {
                for (const [key, value] of Object.entries(chapterDefinitions)) {
                    if (Array.isArray(value) ? value.includes(convTitle) : value === convTitle) {
                        chapter = parseInt(key);
                        break;
                    }
                }
            }
        });
        if (chapter === null) {
            log(`Warning: unable to determine chapter number for file ${file}`);
        }

        data.conversations.forEach(conversation => {
            const titleField = conversation.fields?.find(f =>
                f.type === 0 && f.title.toLowerCase() === 'title'
            );
            const convTitle = titleField?.value || '';

            orderConversationEntries(conversation.dialogueEntries).forEach(entry => {
                const dialogueField = entry.fields?.find(f =>
                    f.type === 4 && f.title === process.env.BASE_LANG
                );
                const menuField = entry.fields?.find(f =>
                    f.type === 4 && f.title === `Menu Text ${process.env.BASE_LANG}`
                );
                const chapterValue = chapter === null ? undefined : chapter;
                if (menuField?.value) {
                    entries.push({ key: `Dialogue/${convTitle}/${entry.id}/MenuText`, chapter: chapterValue });
                }
                if (dialogueField?.value) {
                    entries.push({ key: `Dialogue/${convTitle}/${entry.id}/DialogueText`, chapter: chapterValue });
                }
            });
        });
    });

    // same comparator as the sheetifier
    entries.sort((a, b) => {
        if (a.chapter === undefined) return 1;
        if (b.chapter === undefined) return -1;
        return a.chapter - b.chapter;
    });

    return entries.map(e => e.key);
}

async function main() {
    console.log(DRY_RUN ? 'Running in dry-run mode, the storage will not be modified.' : '');

    log('Building natural dialogue order...');
    const rankedKeys = buildRankedKeys();
    console.log(`Built natural order for ${rankedKeys.length} dialogue keys.`);
    log(`Built natural order for ${rankedKeys.length} dialogue keys.`);

    const spreadsheet = new ThousandXspreadsheeT({
        STORAGE: process.env.STORAGE,
        GOOGLE_CREDENTIALS_FILE: path.join(__dirname, '../../' + process.env.GOOGLE_CREDENTIALS_FILE),
        SPREADSHEET_ID: process.env.SPREADSHEET_ID,
        ACTORS_SHEET_NAME: process.env.ACTORS_SHEET_NAME,
        QUESTS_SHEET_NAME: process.env.QUESTS_SHEET_NAME,
        SYSTEM_SHEET_NAME: process.env.SYSTEM_SHEET_NAME,
        DIALOGUES_SHEET_NAME: process.env.DIALOGUES_SHEET_NAME,
        STRINGS_SHEET_NAME: process.env.STRINGS_SHEET_NAME
    });

    const dialogues = await spreadsheet.getDialogues();
    const currentKeys = Object.keys(dialogues);
    console.log(`Storage contains ${currentKeys.length} dialogue rows.`);

    const targetKeys = buildTargetOrder(currentKeys, rankedKeys);
    const rankedLower = new Set(rankedKeys.map(k => k.toLowerCase()));
    const knownCount = currentKeys.filter(k => rankedLower.has(k.toLowerCase())).length;
    const moves = computeMoves(currentKeys, targetKeys);
    console.log(`${knownCount} rows match exported dialogues, ${currentKeys.length - knownCount} stay in place.`);
    console.log(`${moves.length} row moves needed.`);
    log(`${knownCount}/${currentKeys.length} rows matched, ${moves.length} moves needed.`);

    if (moves.length === 0) {
        console.log('Dialogues are already in natural order, nothing to do.');
        return;
    }

    if (DRY_RUN) {
        console.log('Dry run: no changes were made.');
        return;
    }

    console.log('Reordering rows, this may take a while...');
    const moved = await spreadsheet.reorderDialogues(targetKeys);
    await spreadsheet.commit();
    console.log(`Done, ${moved} rows moved.`);
    log(`Done, ${moved} rows moved.`);
}

main().catch(error => {
    log(`Error: ${error.stack || error}`);
    console.error('Error:', error);
    process.exit(1);
});
