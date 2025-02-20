const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const ThousandXspreadsheeT = require('../../Misc/ThousandXspreadsheeT');
const sleep = ms => new Promise(res => setTimeout(res, ms));

dotenv.config({ path: '.env' });
const resDir = path.isAbsolute(process.env.RES_DIR)
    ? process.env.RES_DIR
    : path.join(__dirname, '../../', process.env.RES_DIR);

let allQuests = [];
let allActors = [];
let allDialogues = [];
let allTerms = {};

const chapterDefinitions = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/chapter-definitions.json'), 'utf-8'));

const lang_bind = {
    en: 0,
    zh: 1,
    ja: 2
};

function getAllJsonFiles(dir, files = []) {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
            getAllJsonFiles(fullPath, files);
        } else if (path.extname(fullPath).toLowerCase() === '.json') {
            files.push(fullPath);
        }
    });
    return files;
}

const jsonFiles = getAllJsonFiles(resDir);

// Process I2Languages.json separately if it exists
const i2LanguagesFile = jsonFiles.find(file => path.basename(file) === 'I2Languages.json');
if (i2LanguagesFile) {
    try {
        console.log(`Processing ${i2LanguagesFile}...`);
        const data = JSON.parse(fs.readFileSync(i2LanguagesFile, 'utf-8'));
        const lang_numeric = lang_bind[process.env.BASE_LANG];
        let termText = '';

        if (data.mSource?.mTerms?.length) {
            data.mSource.mTerms.forEach(term => {
                if (term.TermType === 0 && term.Languages?.[lang_numeric]) {
                    termText = term.Languages[lang_numeric];
                    allTerms[term.Term] = termText.replace(/\t/g, '\\t');
                }
            });
        }
        console.log(`Found ${Object.keys(allTerms).length} terms.\n`);
    } catch (err) {
        console.error(`Error processing ${i2LanguagesFile}:`, err);
    }
}

jsonFiles.forEach(file => {
    if (path.basename(file) === 'I2Languages.json') return;

    try {
        console.log(`Processing ${file}...`);
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        let fileQuests = [];
        let fileActors = [];
        let fileDialoguesCount = 0;
        let chapterNumber = null;
        let fileDialogues = [];

        // Determine chapter number from conversations
        if (data.conversations?.length) {
            data.conversations.forEach(conversation => {
                const titleField = conversation.fields?.find(f =>
                    f.type === 0 &&
                    f.title.toLowerCase() === 'title'
                );
                const convTitle = titleField?.value || '';

                if (!chapterNumber) {
                    for (const [key, value] of Object.entries(chapterDefinitions)) {
                        if (Array.isArray(value) ? value.includes(convTitle) : value === convTitle) {
                            chapterNumber = parseInt(key);
                            break;
                        }
                    }
                }
            });
        }

        // Process Quests
        if (data.items?.length) {
            data.items.forEach(item => {
                const keyField = item.fields?.find(f =>
                    f.type === 0 &&
                    f.title === `Name`
                );
                const nameField = item.fields?.find(f =>
                    f.type === 4 &&
                    f.title === `Description ${process.env.BASE_LANG}`
                );
                if (keyField && nameField) {
                    fileQuests.push({
                        key: keyField.value,
                        value: nameField.value
                    });
                }
            });
        }

        // Process Actors
        if (data.actors?.length) {
            data.actors.forEach(actor => {
                const keyField = actor.fields?.find(f =>
                    f.type === 0 &&
                    f.title === "Name"
                );
                let nameField = actor.fields?.find(f =>
                    f.type === 4 &&
                    f.title === `Display Name ${process.env.BASE_LANG}`
                );
                if (keyField && !nameField) {
                    // special treatment for "Grace"
                    console.warn('Actor with no localization field, switching to type 0.')
                    nameField = actor.fields?.find(f =>
                        f.type === 0 &&
                        f.title === `Display Name ${process.env.BASE_LANG}`
                    );
                }
                if (keyField && nameField) {
                    fileActors.push({
                        key: keyField.value,
                        value: nameField.value
                    });
                }
            });
        }

        // Process Dialogues
        if (data.conversations?.length) {
            data.conversations.forEach(conversation => {
                const titleField = conversation.fields?.find(f =>
                    f.type === 0 &&
                    f.title.toLowerCase() === 'title'
                );
                const convTitle = titleField?.value || '';

                conversation.dialogueEntries?.forEach(entry => {
                    const dialogueField = entry.fields?.find(f =>
                        f.type === 4 &&
                        f.title === process.env.BASE_LANG
                    );
                    //if (!dialogueField) return; // apparently there are dialogues without dialogue text

                    const menuField = entry.fields?.find(f =>
                        f.type === 4 &&
                        f.title === `Menu Text ${process.env.BASE_LANG}`
                    );

                    let actorText;
                    const actorField = entry.fields?.find(f => f.title === 'Actor');
                    if (actorField?.value && data.actors?.length) {
                        const actor = data.actors.find(a =>
                            a.id.toString() === actorField.value.toString()
                        );
                        const actorNameField = actor?.fields?.find(f =>
                            (f.type === 4 || f.type === 0) &&
                            f.title === `Display Name ${process.env.BASE_LANG}`
                        );
                        actorText = actorNameField?.value;
                        if (actorText) {
                            actorText = actorText.replace(/<[^>]+>/g, ''); // make human-readable
                        }
                    }

                    const dialogueKey = `${convTitle}/${entry.id}`;
                    if (menuField || dialogueField) {
                        fileDialogues.push({
                            key: dialogueKey,
                            value: {
                                ...(actorText && { actor_text: actorText }),
                                ...(menuField?.value && { menu_text: menuField.value }),
                                ...(dialogueField?.value && { dialogue_text: dialogueField.value }),
                                from_file: file,
                                chapter_number: chapterNumber
                            }
                        });
                        fileDialoguesCount++;
                    }
                });
            });
        }

        if (chapterNumber === null) {
            console.warn(`Warning: Unable to determine chapter number for file ${file}`);
        }

        allQuests = [...allQuests, ...fileQuests];
        allActors = [...allActors, ...fileActors];
        allDialogues = [...allDialogues, ...fileDialogues];

        console.log(`Found ${fileQuests.length} quests.\nFound ${fileActors.length} actors.\nFound ${fileDialoguesCount} dialogues.\n`);
    } catch (err) {
        console.error(`Error processing ${file}:`, err);
    }
});

// Sort dialogues by chapter number, preserving the internal order of dialogues within each file
console.log("Sorting by chapter...\n");
allDialogues = allDialogues
    .sort((a, b) => {
        if (a.value.chapter_number === undefined) return 1;
        if (b.value.chapter_number === undefined) return -1;
        return a.value.chapter_number - b.value.chapter_number;
    })
    .reduce((acc, { key, value }) => {
        acc[key] = value;
        return acc;
    }, {});

// Sort allActors and allQuests by key alphabetically
allActors = allActors
    .sort((a, b) => a.key.localeCompare(b.key))
    .reduce((acc, { key, value }) => {
        acc[key] = value;
        return acc;
    }, {});
allQuests = allQuests
    .sort((a, b) => a.key.localeCompare(b.key))
    .reduce((acc, { key, value }) => {
        acc[key] = value;
        return acc;
    }, {});

// Final output and file generation
console.log(`Results:\nUnique Actors (${Object.keys(allActors).length})\nQuests (${Object.keys(allQuests).length})\nDialogues (${Object.keys(allDialogues).length})\nTerms (${Object.keys(allTerms).length})`);

fs.writeFileSync(path.join(__dirname, '../../data/parsed_actors.json'), JSON.stringify(allActors, null, 2));
fs.writeFileSync(path.join(__dirname, '../../data/parsed_quests.json'), JSON.stringify(allQuests, null, 2));
fs.writeFileSync(path.join(__dirname, '../../data/parsed_dialogues.json'), JSON.stringify(allDialogues, null, 2));
fs.writeFileSync(path.join(__dirname, '../../data/parsed_terms.json'), JSON.stringify(allTerms, null, 2));

// this was originally 2 separate scripts,
// that why we're reading the files we've just saved, but whatever

console.log(`\nUploading data to the document...`);

const files = {
    actors: path.join(__dirname, '../../data/parsed_actors.json'),
    quests: path.join(__dirname, '../../data/parsed_quests.json'),
    dialogues: path.join(__dirname, '../../data/parsed_dialogues.json'),
    system: path.join(__dirname, '../../data/parsed_terms.json')
};

async function main() {
    try {
        const spreadsheet = new ThousandXspreadsheeT({
            GOOGLE_CREDENTIALS_FILE: path.join(__dirname, '../../' + process.env.GOOGLE_CREDENTIALS_FILE),
            SPREADSHEET_ID: process.env.SPREADSHEET_ID,
            ACTORS_SHEET_NAME: process.env.ACTORS_SHEET_NAME,
            QUESTS_SHEET_NAME: process.env.QUESTS_SHEET_NAME,
            SYSTEM_SHEET_NAME: process.env.SYSTEM_SHEET_NAME,
            DIALOGUES_SHEET_NAME: process.env.DIALOGUES_SHEET_NAME
        });

        // Load and process actors
        console.log("Uploading actors...")
        const actorsData = JSON.parse(fs.readFileSync(files.actors, 'utf8'));
        const actorsStrings = {};
        for (const [key, value] of Object.entries(actorsData)) {
            actorsStrings[`Actor/${key}`] = { original: value };
        }
        await spreadsheet.replaceActors(actorsStrings);

        await sleep(1000); // thx google, in 2025 your own library has no clue about your rate limits

        // Load and process quests
        console.log("Uploading quests...")
        const questsData = JSON.parse(fs.readFileSync(files.quests, 'utf8'));
        const questsStrings = {};
        for (const [key, value] of Object.entries(questsData)) {
            questsStrings[`Quest/${key}`] = { original: value };
        }
        await spreadsheet.replaceQuests(questsStrings);

        await sleep(1000);

        // Load and process system terms
        console.log("Uploading system...")
        const systemData = JSON.parse(fs.readFileSync(files.system, 'utf8'));
        const systemStrings = {};
        for (const [key, value] of Object.entries(systemData)) {
            systemStrings[`System/${key}`] = { original: value };
        }
        await spreadsheet.replaceSystem(systemStrings);

        await sleep(1000);

        // Load and process dialogues
        console.log("Uploading dialogues...")
        const dialoguesData = JSON.parse(fs.readFileSync(files.dialogues, 'utf8'));
        const dialoguesStrings = {};
        const actorTexts = new Set();
        for (const [key, entry] of Object.entries(dialoguesData)) {
            const baseKey = `Dialogue/${key}`;
            const actor = entry.actor_text;
            if (actor !== undefined) {
                actorTexts.add(actor);
            }

            if (entry.menu_text) {
                const menuKey = `${baseKey}/MenuText`;
                dialoguesStrings[menuKey] = {
                    actor: actor,
                    original: entry.menu_text
                };
            }

            if (entry.dialogue_text) {
                const dialogueKey = `${baseKey}/DialogueText`;
                dialoguesStrings[dialogueKey] = {
                    actor: actor,
                    original: entry.dialogue_text
                };
            }
        }
        await spreadsheet.replaceDialogues(dialoguesStrings);

        await sleep(1000);

        // Process and replace Chars vocab
        console.log("Uploading unique chars to vocabulary...")
        const sortedActorTexts = Array.from(actorTexts).sort();
        const vocabStrings = {};
        sortedActorTexts.forEach(actor => {
            vocabStrings[actor] = null; // we only need keys
        });
        await spreadsheet.replaceVocab('Chars', vocabStrings);

        console.log('All data processed and uploaded successfully.');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();