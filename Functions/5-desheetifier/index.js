const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const ThousandXspreadsheeT = require('../../Misc/ThousandXspreadsheeT');
const JSONbig = require('json-bigint');

dotenv.config({ path: '.env' });
const resDir = path.isAbsolute(process.env.RES_DIR) ? process.env.RES_DIR : path.join(__dirname, '../../', process.env.RES_DIR);

const lang_bind = {
    en: 0,
    zh: 1,
    ja: 2
};

// Statistics
let stats = {
    spreadsheet: {
        actors: 0,
        quests: 0,
        system: 0,
        dialogues: 0
    },
    replaced: {
        actors: 0,
        quests: 0,
        system: 0,
        dialogues: 0
    },
    emptyFallbacks: {
        actors: 0,
        quests: 0,
        system: 0,
        dialogues: 0
    }
};

// Track unmatched strings from spreadsheet
let unmatchedStrings = {
    actors: new Set(),
    quests: new Set(),
    system: new Set(),
    dialogues: new Set()
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

async function main() {
    try {
        const spreadsheet = new ThousandXspreadsheeT({
            GOOGLE_CREDENTIALS_FILE: path.join(__dirname, '../../', process.env.GOOGLE_CREDENTIALS_FILE),
            SPREADSHEET_ID: process.env.SPREADSHEET_ID,
            ACTORS_SHEET_NAME: process.env.ACTORS_SHEET_NAME,
            QUESTS_SHEET_NAME: process.env.QUESTS_SHEET_NAME,
            SYSTEM_SHEET_NAME: process.env.SYSTEM_SHEET_NAME,
            DIALOGUES_SHEET_NAME: process.env.DIALOGUES_SHEET_NAME
        });

        // Get all translations from spreadsheet
        console.log('Loading translations from spreadsheet...');
        const [actors, quests, system, dialogues] = await Promise.all([
            spreadsheet.getActors(),
            spreadsheet.getQuests(),
            spreadsheet.getSystem(),
            spreadsheet.getDialogues()
        ]);

        stats.spreadsheet.actors = Object.keys(actors).length;
        stats.spreadsheet.quests = Object.keys(quests).length;
        stats.spreadsheet.system = Object.keys(system).length;
        stats.spreadsheet.dialogues = Object.keys(dialogues).length;

        // Initialize unmatched sets
        unmatchedStrings.actors = new Set(Object.keys(actors));
        unmatchedStrings.quests = new Set(Object.keys(quests));
        unmatchedStrings.system = new Set(Object.keys(system));
        unmatchedStrings.dialogues = new Set(Object.keys(dialogues));

        const jsonFiles = getAllJsonFiles(resDir);

        // Process I2Languages.json for system strings
        const i2LanguagesFile = jsonFiles.find(file => path.basename(file) === 'I2Languages.json');
        if (i2LanguagesFile) {
            console.log(`Processing ${i2LanguagesFile}...`);
            const data = JSON.parse(fs.readFileSync(i2LanguagesFile, 'utf-8'));
            const targetLangIndex = lang_bind[process.env.TARGET_LANG];

            if (data.mSource?.mTerms?.length) {
                data.mSource.mTerms.forEach(term => {
                    const systemKey = `System/${term.Term}`;
                    if (system[systemKey]) {
                        const translation = system[systemKey].translated;
                        if (translation) {
                            if (!term.Languages) {
                                term.Languages = [];
                            }
                            term.Languages[targetLangIndex] = translation.replace(/\\t/g, '\t');
                            stats.replaced.system++;
                            unmatchedStrings.system.delete(systemKey);
                        } else {
                            stats.emptyFallbacks.system++;
                            console.warn(`Warning: Empty translation for system string: ${systemKey}`);
                            unmatchedStrings.system.delete(systemKey);
                        }
                    }
                });
            }
            fs.writeFileSync(i2LanguagesFile, JSON.stringify(data, null, 2));
        }

        // Process other JSON files
        for (const file of jsonFiles) {
            if (path.basename(file) === 'I2Languages.json') continue;

            console.log(`Processing ${file}...`);
            const data = JSONbig.parse(fs.readFileSync(file, 'utf-8'));

            // Process Actors
            if (data.actors?.length) {
                data.actors.forEach(actor => {
                    const nameField = actor.fields?.find(f =>
                        f.type === 0 &&
                        f.title === "Name"
                    );
                    if (nameField) {
                        const actorKey = `Actor/${nameField.value}`;
                        if (actors[actorKey]) {
                            let displayNameField = actor.fields?.find(f =>
                                f.type === 4 &&
                                f.title === `Display Name ${process.env.TARGET_LANG}`
                            );
                            if (!displayNameField) {
                                // workaround for "Grace"
                                displayNameField = actor.fields?.find(f =>
                                    f.type === 0 &&
                                    f.title === `Display Name ${process.env.TARGET_LANG}`
                                );
                            }
                            if (displayNameField) {
                                const translation = actors[actorKey].translated;
                                if (translation) {
                                    displayNameField.value = translation.replace(/\\t/g, '\t');
                                    stats.replaced.actors++;
                                    unmatchedStrings.actors.delete(actorKey);
                                } else {
                                    stats.emptyFallbacks.actors++;
                                    console.warn(`Warning: Empty translation for actor: ${actorKey}`);
                                    unmatchedStrings.actors.delete(actorKey);
                                }
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
                        f.title === "Name"
                    );
                    if (keyField) {
                        const questKey = `Quest/${keyField.value}`;
                        if (quests[questKey]) {
                            const descField = item.fields?.find(f =>
                                f.type === 4 &&
                                f.title === `Description ${process.env.TARGET_LANG}`
                            );
                            if (descField) {
                                const translation = quests[questKey].translated;
                                if (translation) {
                                    descField.value = translation.replace(/\\t/g, '\t');
                                    stats.replaced.quests++;
                                    unmatchedStrings.quests.delete(questKey);
                                } else {
                                    stats.emptyFallbacks.quests++;
                                    console.warn(`Warning: Empty translation for quest: ${questKey}`);
                                    unmatchedStrings.quests.delete(questKey);
                                }
                            }
                        }
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
                    const convTitle = titleField?.value;
                    if (!convTitle) return;

                    conversation.dialogueEntries?.forEach(entry => {
                        const dialogueKey = `Dialogue/${convTitle}/${entry.id}`;

                        // Process main dialogue text
                        const dialogueField = entry.fields?.find(f =>
                            f.type === 4 &&
                            f.title === process.env.TARGET_LANG
                        );
                        const dialogueTextKey = `${dialogueKey}/DialogueText`;
                        if (dialogueField && dialogues[dialogueTextKey]) {
                            const translation = dialogues[dialogueTextKey].translated;
                            if (translation) {
                                dialogueField.value = translation.replace(/\\t/g, '\t');
                                stats.replaced.dialogues++;
                                unmatchedStrings.dialogues.delete(dialogueTextKey);
                            } else {
                                stats.emptyFallbacks.dialogues++;
                                console.warn(`Warning: Empty translation for dialogue: ${dialogueTextKey}`);
                                unmatchedStrings.dialogues.delete(dialogueTextKey);
                            }
                        }

                        // Process menu text
                        const menuField = entry.fields?.find(f =>
                            f.type === 4 &&
                            f.title === `Menu Text ${process.env.TARGET_LANG}`
                        );
                        const menuTextKey = `${dialogueKey}/MenuText`;
                        if (menuField && dialogues[menuTextKey]) {
                            const translation = dialogues[menuTextKey].translated;
                            if (translation) {
                                menuField.value = translation.replace(/\\t/g, '\t');
                                stats.replaced.dialogues++;
                                unmatchedStrings.dialogues.delete(menuTextKey);
                            } else {
                                stats.emptyFallbacks.dialogues++;
                                console.warn(`Warning: Empty translation for menu text: ${menuTextKey}`);
                                unmatchedStrings.dialogues.delete(menuTextKey);
                            }
                        }
                    });
                });
            }

            fs.writeFileSync(file, JSONbig.stringify(data, null, 2));
        }

        // Print statistics
        console.log('\nProcessing completed!\n');
        console.log('Statistics:');
        console.log('From spreadsheet:');
        console.log(`- Actors: ${stats.spreadsheet.actors}`);
        console.log(`- Quests: ${stats.spreadsheet.quests}`);
        console.log(`- System: ${stats.spreadsheet.system}`);
        console.log(`- Dialogues: ${stats.spreadsheet.dialogues}`);
        
        console.log('\nReplaced in files:');
        console.log(`- Actors: ${stats.replaced.actors}`);
        console.log(`- Quests: ${stats.replaced.quests}`);
        console.log(`- System: ${stats.replaced.system}`);
        console.log(`- Dialogues: ${stats.replaced.dialogues}`);

        console.log('\nEmpty translations (skipped):');
        console.log(`- Actors: ${stats.emptyFallbacks.actors}`);
        console.log(`- Quests: ${stats.emptyFallbacks.quests}`);
        console.log(`- System: ${stats.emptyFallbacks.system}`);
        console.log(`- Dialogues: ${stats.emptyFallbacks.dialogues}`);

        console.log('\nStrings not found in files:');
        console.log(`- Actors: ${unmatchedStrings.actors.size}`);
        console.log(`- Quests: ${unmatchedStrings.quests.size}`);
        console.log(`- System: ${unmatchedStrings.system.size}`);
        console.log(`- Dialogues: ${unmatchedStrings.dialogues.size}`);

        if (unmatchedStrings.actors.size > 0) {
            console.log('\nUnmatched actors:', Array.from(unmatchedStrings.actors));
        }
        if (unmatchedStrings.quests.size > 0) {
            console.log('\nUnmatched quests:', Array.from(unmatchedStrings.quests));
        }
        if (unmatchedStrings.system.size > 0) {
            console.log('\nUnmatched system strings:', Array.from(unmatchedStrings.system));
        }
        if (unmatchedStrings.dialogues.size > 0) {
            console.log('\nUnmatched dialogues:', Array.from(unmatchedStrings.dialogues));
        }

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

main();