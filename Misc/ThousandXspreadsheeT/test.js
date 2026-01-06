const ThousandXspreadsheeT = require('./index.js');
const path = require('path');

async function testLocalFileSupport() {
    console.log('Testing ThousandXspreadsheeT with local file support...');
    
    // Test configuration for local file
    const config = {
        STORAGE: path.join(__dirname, 'test-spreadsheet.xlsx'),
        ACTORS_SHEET_NAME: 'Actors',
        QUESTS_SHEET_NAME: 'Quests',
        SYSTEM_SHEET_NAME: 'System',
        DIALOGUES_SHEET_NAME: 'Dialogues',
        STRINGS_SHEET_NAME: 'Strings'
    };

    try {
        // Create instance
        console.log('Creating ThousandXspreadsheeT instance...');
        const spreadsheet = new ThousandXspreadsheeT(config);
        
        // Test reading data (this will create the file if it doesn't exist)
        console.log('Testing getStrings()...');
        const strings = await spreadsheet.getStrings();
        console.log('Strings data:', Object.keys(strings).length, 'entries');
        
        // Test adding some data
        console.log('Testing appendStrings()...');
        await spreadsheet.appendStrings({
            'test_key_1': 'Test Value 1',
            'test_key_2': 'Test Value 2'
        });
        
        // Test reading updated data
        console.log('Reading updated strings...');
        const updatedStrings = await spreadsheet.getStrings();
        console.log('Updated strings data:', Object.keys(updatedStrings).length, 'entries');
        
        // Test dialogues
        console.log('Testing getDialogues()...');
        const dialogues = await spreadsheet.getDialogues();
        console.log('Dialogues data:', Object.keys(dialogues).length, 'entries');
        
        // Test adding dialogue
        console.log('Testing appendDialogues()...');
        await spreadsheet.appendDialogues({
            'test_dialogue_1': {
                actor: 'Test Actor',
                original: 'Hello world!',
                translated: 'Привет мир!'
            }
        });
        
        // Test marking dialogues
        console.log('Testing markDialogues()...');
        await spreadsheet.markDialogues(['test_dialogue_1'], '#FF0000', 'original');
        
        console.log('✅ All tests passed! Local file support is working correctly.');
        console.log(`Test file created at: ${config.STORAGE}`);
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
testLocalFileSupport();