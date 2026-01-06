const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const ThousandXspreadsheeT = require('../../Misc/ThousandXspreadsheeT');
const JSONbig = require('json-bigint');
const nanospinner = require('nanospinner');

const initspinner = nanospinner.createSpinner('Initializing...').start();

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
        dialogues: 0,
        strings: 0
    },
    replaced: {
        actors: 0,
        quests: 0,
        system: 0,
        dialogues: 0,
        strings: 0
    },
    emptyFallbacks: {
        actors: 0,
        quests: 0,
        system: 0,
        dialogues: 0,
        strings: 0
    }
};

// Track unmatched strings from spreadsheet
let unmatchedStrings = {
    actors: new Set(),
    quests: new Set(),
    system: new Set(),
    dialogues: new Set(),
    strings: new Set()
};

const logPath = path.join(__dirname, '..', '..', 'Logs', '5-desheetifier.log');
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, '');

function log(message) {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const logMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync(logPath, logMessage);
}

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

async function main() {
    try {
        spinner = nanospinner.createSpinner('Loading translations from spreadsheet...').start();
        log('Loading translations from spreadsheet...');

        const spreadsheet = new ThousandXspreadsheeT({
            STORAGE: process.env.STORAGE,
            GOOGLE_CREDENTIALS_FILE: path.join(__dirname, '../../', process.env.GOOGLE_CREDENTIALS_FILE),
            SPREADSHEET_ID: process.env.SPREADSHEET_ID,
            ACTORS_SHEET_NAME: process.env.ACTORS_SHEET_NAME,
            QUESTS_SHEET_NAME: process.env.QUESTS_SHEET_NAME,
            SYSTEM_SHEET_NAME: process.env.SYSTEM_SHEET_NAME,
            DIALOGUES_SHEET_NAME: process.env.DIALOGUES_SHEET_NAME,
            STRINGS_SHEET_NAME: process.env.STRINGS_SHEET_NAME
        });

        // Get all translations from spreadsheet
        const [actors, quests, system, dialogues, strings] = await Promise.all([
            spreadsheet.getActors(),
            spreadsheet.getQuests(),
            spreadsheet.getSystem(),
            spreadsheet.getDialogues(),
            spreadsheet.getStrings(),
        ]);

        stats.spreadsheet.actors = Object.keys(actors).length;
        stats.spreadsheet.quests = Object.keys(quests).length;
        stats.spreadsheet.system = Object.keys(system).length;
        stats.spreadsheet.dialogues = Object.keys(dialogues).length;
        stats.spreadsheet.strings = Object.keys(strings).length;

        // Initialize unmatched sets
        unmatchedStrings.actors = new Set(Object.keys(actors));
        unmatchedStrings.quests = new Set(Object.keys(quests));
        unmatchedStrings.system = new Set(Object.keys(system));
        unmatchedStrings.dialogues = new Set(Object.keys(dialogues));
        unmatchedStrings.strings = new Set(Object.keys(strings));

        const jsonFiles = getAllJsonFiles(resDir);
        spinner.success();

        // Process I2Languages.json for system strings
        spinner = nanospinner.createSpinner('Processing I2Languages...').start();
        const i2LanguagesFile = path.join(resDir, 'I2Languages.json');
        log(`Processing ${i2LanguagesFile}...`);
        if (fs.existsSync(i2LanguagesFile)) {
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
                            log(`Warning: Empty translation for system string: ${systemKey}`);
                            unmatchedStrings.system.delete(systemKey);
                        }
                    }
                });
            }
            fs.writeFileSync(path.join(path.dirname(i2LanguagesFile), 'I2Languages-mod.json'), JSON.stringify(data, null, 2));
        } else {
            spinner.error();
            console.error(`No ${i2LanguagesFile}, run Exporter first?`);
            process.exit(1);
        }
        spinner.success();

        // Process other JSON files
        spinner = nanospinner.createSpinner('Processing dialogue databases...').start();
        for (const file of jsonFiles) {
            log(`Processing ${file}...`);
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
                                    log(`Warning: Empty translation for actor: ${actorKey}`);
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
                                    log(`Warning: Empty translation for quest: ${questKey}`);
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
                                log(`Warning: Empty translation for dialogue: ${dialogueTextKey}`);
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
                                log(`Warning: Empty translation for menu text: ${menuTextKey}`);
                                unmatchedStrings.dialogues.delete(menuTextKey);
                            }
                        }
                    });
                });
            }

            const baseDir = path.dirname(file);
            const fileNameWithoutExt = path.basename(file, '.json');
            const newFilePath = path.join(baseDir, `${fileNameWithoutExt}-mod.json`);
            fs.writeFileSync(newFilePath, JSONbig.stringify(data, null, 2));
        }
        spinner.success();

        // Process strings.json
        spinner = nanospinner.createSpinner('Processing strings...').start();
        const stringsFile = path.join(resDir, 'strings.json');
        if (stringsFile) {
            log(`Processing ${stringsFile}...`);
            const data = JSON.parse(fs.readFileSync(stringsFile, 'utf-8'));

            Object.keys(data).forEach(key => {
                if (strings[key]) {
                    const translation = strings[key];
                    if (translation) {
                        data[key] = translation;
                        stats.replaced.strings++;
                    } else {
                        stats.emptyFallbacks.strings++;
                        console.warn(`Warning: Empty translation for string: ${key}`);
                    }
                }
                unmatchedStrings.strings.delete(key); // we don't need to track these
            });

            fs.writeFileSync(path.join(path.dirname(stringsFile), 'strings-mod.json'), JSON.stringify(data, null, 2));
        }
        spinner.success();

        // Create base statistics section
        const baseStats = `\nProcessing completed!\n
[SUMMARY]
From spreadsheet:
- Actors: ${stats.spreadsheet.actors}
- Quests: ${stats.spreadsheet.quests}
- System: ${stats.spreadsheet.system}
- Dialogues: ${stats.spreadsheet.dialogues}
- Strings: ${stats.spreadsheet.strings}

Replaced in files:
- Actors: ${stats.replaced.actors}
- Quests: ${stats.replaced.quests}
- System: ${stats.replaced.system}
- Dialogues: ${stats.replaced.dialogues}
- Strings: ${stats.replaced.strings}`;

        // Create empty translations section (only showing non-zero values)
        let emptySection = '';
        const emptyStats = stats.emptyFallbacks;
        if (Object.values(emptyStats).some(val => val > 0)) {
            emptySection = `\n\nEmpty translations (skipped):`;
            if (emptyStats.actors > 0) emptySection += `\n- Actors: ${emptyStats.actors}`;
            if (emptyStats.quests > 0) emptySection += `\n- Quests: ${emptyStats.quests}`;
            if (emptyStats.system > 0) emptySection += `\n- System: ${emptyStats.system}`;
            if (emptyStats.dialogues > 0) emptySection += `\n- Dialogues: ${emptyStats.dialogues}`;
            if (emptyStats.strings > 0) emptySection += `\n- Strings: ${emptyStats.strings}`;
        }
        
        // Create not found section (only showing non-zero values)
        let notFoundSection = '';
        if (Object.values(unmatchedStrings).some(set => set.size > 0)) {
            notFoundSection = `\n\nStrings not found in files:`;
            if (unmatchedStrings.actors.size > 0) notFoundSection += `\n- Actors: ${unmatchedStrings.actors.size}`;
            if (unmatchedStrings.quests.size > 0) notFoundSection += `\n- Quests: ${unmatchedStrings.quests.size}`;
            if (unmatchedStrings.system.size > 0) notFoundSection += `\n- System: ${unmatchedStrings.system.size}`;
            if (unmatchedStrings.dialogues.size > 0) notFoundSection += `\n- Dialogues: ${unmatchedStrings.dialogues.size}`;
            if (unmatchedStrings.strings.size > 0) notFoundSection += `\n- Strings: ${unmatchedStrings.strings.size}`;
        }
        
        // Create unmatched items lists (only for non-empty sets)
        let unmatchedLists = '';
        if (unmatchedStrings.actors.size > 0) unmatchedLists += `\n\nUnmatched actors: ${Array.from(unmatchedStrings.actors)}`;
        if (unmatchedStrings.quests.size > 0) unmatchedLists += `\n\nUnmatched quests: ${Array.from(unmatchedStrings.quests)}`;
        if (unmatchedStrings.system.size > 0) unmatchedLists += `\n\nUnmatched system strings: ${Array.from(unmatchedStrings.system)}`;
        if (unmatchedStrings.dialogues.size > 0) unmatchedLists += `\n\nUnmatched dialogues: ${Array.from(unmatchedStrings.dialogues)}`;
        if (unmatchedStrings.strings.size > 0) unmatchedLists += `\n\nUnmatched strings: ${Array.from(unmatchedStrings.strings)}`;
        
        // Combine all sections
        const statsOutput = baseStats + emptySection + notFoundSection + unmatchedLists;

        console.log(statsOutput);
        log(statsOutput);

    } catch (error) {
        log(`Error: ${error}`);
        spinner.error();
        console.error('Error:', error);
        process.exit(1);
    }
}

initspinner.success();
main();