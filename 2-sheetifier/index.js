const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: '../.env' });
const resDir = path.join(__dirname, '../', process.env.RES_DIR);

let allQuests = [];
let allActors = [];
let allDialogues = [];

const chapterDefinitions = JSON.parse(fs.readFileSync('../data/chapter-definitions.json', 'utf-8'));

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

jsonFiles.forEach(file => {
    try {
        console.log(`Processing ${file}...`);
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        let fileQuests = [];
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
                const nameField = item.fields?.find(f => 
                    f.type === 4 && 
                    f.title === `Description ${process.env.BASE_LANG}`
                );
                if (nameField) {
                    fileQuests.push({ id: item.id, name: nameField.value });
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
                            if (actorText && !allActors.includes(actorText)) {
                                allActors.push(actorText);
                            }
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
        allDialogues = [...allDialogues, ...fileDialogues];
        
        console.log(`Found ${fileQuests.length} quests.\nFound ${fileDialoguesCount} dialogues.\n`);
    } catch (err) {
        console.error(`Error processing ${file}:`, err);
    }
});

// Sort dialogues by chapter number, preserving the internal order of dialogues within each file
console.log("Sorting by chapter...\n");
const sortedDialogues = allDialogues
.sort((a, b) => {
    if (a.value.chapter_number === undefined) return 1;
    if (b.value.chapter_number === undefined) return -1;
    return a.value.chapter_number - b.value.chapter_number;
})
.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
}, {});

// Final output and file generation
process.on('exit', () => {
    console.log(`Results:\nUnique Actors (${allActors.length})\nQuests (${allQuests.length})\nDialogues (${allDialogues.length})`);

    fs.writeFileSync('../data/parsed_actors.json', JSON.stringify(allActors, null, 2));
    fs.writeFileSync('../data/parsed_quests.json', JSON.stringify(allQuests, null, 2));
    fs.writeFileSync('../data/parsed_dialogues.json', JSON.stringify(sortedDialogues, null, 2));
});