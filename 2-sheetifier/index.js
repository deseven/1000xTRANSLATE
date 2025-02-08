const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: '../.env' });
const resDir = path.join(__dirname, '../', process.env.RES_DIR);

let allQuests = [];
let allActors = [];
let allDialogues = [];
let allTerms = {};

const chapterDefinitions = JSON.parse(fs.readFileSync('../data/chapter-definitions.json', 'utf-8'));

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

        if (data.mSource?.mTerms?.length) {
            data.mSource.mTerms.forEach(term => {
                if (term.TermType === 0 && term.Languages?.[lang_numeric]) {
                    allTerms[term.Term] = term.Languages[lang_numeric];
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
                const nameField = actor.fields?.find(f =>
                    f.type === 4 &&
                    f.title === `Display Name ${process.env.BASE_LANG}`
                );
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
                    if (!dialogueField) return;

                    const menuField = entry.fields?.find(f =>
                        f.type === 4 &&
                        f.title === `Menu Text ${process.env.BASE_LANG}`
                    );

                    let actorText;
                    const conversantField = entry.fields?.find(f => f.title === 'Conversant');
                    if (conversantField?.value && data.actors?.length) {
                        const actor = data.actors.find(a =>
                            a.id.toString() === conversantField.value.toString()
                        );
                        const actorNameField = actor?.fields?.find(f =>
                            f.type === 4 &&
                            f.title === `Display Name ${process.env.BASE_LANG}`
                        );
                        actorText = actorNameField?.value;
                        if (actorText) {
                            actorText = actorText.replace(/<[^>]+>/g, ''); // make human-readable
                        }
                    }

                    const dialogueKey = `${convTitle}/${entry.id}`;
                    fileDialogues.push({
                        key: dialogueKey,
                        value: {
                            ...(actorText && { actor_text: actorText }),
                            ...(menuField?.value && { menu_text: menuField.value }),
                            dialogue_text: dialogueField.value,
                            from_file: file,
                            chapter_number: chapterNumber
                        }
                    });
                    fileDialoguesCount++;
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

fs.writeFileSync('../data/parsed_actors.json', JSON.stringify(allActors, null, 2));
fs.writeFileSync('../data/parsed_quests.json', JSON.stringify(allQuests, null, 2));
fs.writeFileSync('../data/parsed_dialogues.json', JSON.stringify(allDialogues, null, 2));
fs.writeFileSync('../data/parsed_terms.json', JSON.stringify(allTerms, null, 2));