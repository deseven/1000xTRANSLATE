require('dotenv').config();
const path = require('path');
const { OpenAI } = require('openai');
const readline = require('readline');
const ThousandXspreadsheeT = require('../../Misc/ThousandXspreadsheeT');

const contextOptions = [
    'A dialogue between two girls, informal.',
    'A dialogue between two girls, formal.',
    'Several girls talking.',
    'Narrator telling a story.'
];

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_ENDPOINT
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
    // Check command line arguments
    const dialogueKeyFilter = process.argv[2];
    const forceTranslation = process.argv[3] === 'force';

    if (!dialogueKeyFilter) {
        console.error('Please provide a dialogue key filter as an argument');
        process.exit(1);
    }

    // Initialize spreadsheet
    const spreadsheet = new ThousandXspreadsheeT({
        GOOGLE_CREDENTIALS_FILE: path.join(__dirname, '../../' + process.env.GOOGLE_CREDENTIALS_FILE),
        SPREADSHEET_ID: process.env.SPREADSHEET_ID,
        ACTORS_SHEET_NAME: process.env.ACTORS_SHEET_NAME,
        QUESTS_SHEET_NAME: process.env.QUESTS_SHEET_NAME,
        SYSTEM_SHEET_NAME: process.env.SYSTEM_SHEET_NAME,
        DIALOGUES_SHEET_NAME: process.env.DIALOGUES_SHEET_NAME
    });

    // Get vocabulary and dialogues
    const vocabChars = await spreadsheet.getVocab(process.env.VOCAB_CHARS_SHEET_NAME);
    const vocabTerms = await spreadsheet.getVocab(process.env.VOCAB_TERMS_SHEET_NAME);
    const dialogues = await spreadsheet.getDialogues();

    // Filter dialogues by key and type
    let filteredDialogues = Object.entries(dialogues)
        .filter(([key, value]) => {
            if (!key.endsWith('/DialogueText')) return false;
            if (dialogueKeyFilter === '*') return true;
            if (dialogueKeyFilter.endsWith('*')) {
                const prefix = dialogueKeyFilter.slice(0, -1);
                return key.startsWith(prefix);
            }
            return key === dialogueKeyFilter;
        })
        .filter(([_, value]) => forceTranslation || !value.translated)
        .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});

    // Group dialogues into blocks
    const blocks = {};
    Object.entries(filteredDialogues).forEach(([key, value]) => {
        const parts = key.split('/');
        const entryNumberIndex = parts.findIndex((part, index) => 
            !isNaN(part) && index < parts.length - 1 && parts[index + 1] === 'DialogueText'
        );
        if (entryNumberIndex === -1) return;

        const blockPath = parts.slice(0, entryNumberIndex).join('/');
        const entryNumber = parseInt(parts[entryNumberIndex]);

        blocks[blockPath] = blocks[blockPath] || {};
        blocks[blockPath][entryNumber] = {
            key,
            ...value
        };
    });

    if (!Object.keys(blocks).length) {
        console.log(`No blocks for translation with the '${dialogueKeyFilter}' filter and force:${forceTranslation}`);
        process.exit(1);
    }

    // Get context
    console.log('\nSelect context or enter custom one:');
    contextOptions.forEach((opt, i) => console.log(`${i + 1}. ${opt}`));
    console.log('0. Skip context');
    console.log('C. Enter custom context');
    
    const contextChoice = await question('Your choice: ');
    let context = '';
    if (contextChoice === 'C' || contextChoice === 'c') {
        context = await question('Enter custom context: ');
    } else if (contextChoice !== '0') {
        context = contextOptions[parseInt(contextChoice) - 1];
    }

    // Display statistics
    const totalBlocks = Object.keys(blocks).length;
    const totalStrings = Object.values(blocks)
        .reduce((sum, block) => sum + Object.keys(block).length, 0);

    console.log(`\nStarting translation:`);
    console.log(`Total blocks: ${totalBlocks}`);
    console.log(`Total strings: ${totalStrings}`);
    console.log(`Context: ${context || 'None'}`);
    await question('\nPress Enter to start...');

    // Process blocks
    let processedBlocks = 0;
    let processedStrings = 0;
    let errorBlocks = 0;

    for (const [blockPath, entries] of Object.entries(blocks)) {
        console.log(`\nTranslating block ${++processedBlocks}/${totalBlocks}: ${blockPath}`);

        // Prepare dialogue data
        const sortedEntries = Object.entries(entries)
            .sort(([a], [b]) => parseInt(a) - parseInt(b));

        const dialogueData = sortedEntries.map(([_, entry]) => ({
            actor: entry.actor,
            text: entry.original
        }));

        // Filter vocabulary
        const blockText = dialogueData.map(d => d.text).join(' ');
        const blockActors = new Set(dialogueData.map(d => d.actor));
        
        const filteredChars = Object.entries(vocabChars)
            .filter(([key]) => blockActors.has(key) || blockText.includes(key))
            .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});

        const filteredTerms = Object.entries(vocabTerms)
            .filter(([key]) => blockText.includes(key))
            .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});

        // Prepare prompt
        const prompt = `You are translating a game script from ${process.env.LANG_FROM} to ${process.env.LANG_TO}. You will get a user message with a JSON containing a dialogue.

${Object.keys(filteredChars).length > 0 ? `Names vocabulary (characters, locations, etc):
${Object.entries(filteredChars).map(([k, v]) => `${k} - ${v}`).join('\n')}\n` : ''}

${Object.keys(filteredTerms).length > 0 ? `General vocabulary (everything else):
${Object.entries(filteredTerms).map(([k, v]) => `${k} - ${v}`).join('\n')}\n` : ''}

${context ? `Context:\n${context}\n` : ''}
Translation rules:
1. If vocabularies and context are provided, they must be used in the translation.
2. Keep the tone and style consistent with the original.
3. Do not add or remove any dialogue lines.
4. Keep any tags in the translated text intact (e.g. <color=#B1F9FF>).

Please return the text field translation in JSON format as a simple array of strings following the original order. For example if this is the dialogue you get:
\`\`\`
[
  {
    "actor": "Watcher",
    "text": "Hello."
  },
  {
    "actor": "Healer",
    "text": "Hi, how are you?"
  }
]
\`\`\`

you will need to return the following:
\`\`\`
[
  "${process.env.EXAMPLE_HI}",
  "${process.env.EXAMPLE_HOWRU}"
]
\`\`\`

Do not output anything else except for a valid json array of translated strings.`;

        try {
            // Call OpenAI API
            const completion = await openai.chat.completions.create({
                model: process.env.OPENAI_MODEL,
                messages: [
                    { role: 'system', content: prompt },
                    { role: 'user', content: JSON.stringify(dialogueData, null, 2)}
                ],
                temperature: process.env.OPENAI_TEMPERATURE
            });

            // Parse response
            const response = completion.choices[0].message.content;
            const cleanResponse = response.replace(/```json\n|```\n|```/g, '');
            const translations = JSON.parse(cleanResponse);

            // Update translations
            const updates = {};
            const keysToMark = [];
            
            sortedEntries.forEach(([number, entry], index) => {
                updates[entry.key] = { translated: translations[index] };
                keysToMark.push(entry.key);
            });

            // Update spreadsheet
            await spreadsheet.replaceDialogues(updates);
            await spreadsheet.markDialogues(keysToMark, '#ffaaaa', 'translated');

            processedStrings += sortedEntries.length;

        } catch (error) {
            console.error(`Error processing block ${blockPath}:`, error.message);
            errorBlocks++;
        }
    }

    // Final statistics
    console.log('\nTranslation completed!');
    console.log(`Processed blocks: ${processedBlocks}`);
    console.log(`Processed strings: ${processedStrings}`);
    console.log(`Failed blocks: ${errorBlocks}`);

    rl.close();
}

main().catch(console.error);