const ThousandXspreadsheeT = require('./index.js');
const path = require('path');
const fs = require('fs');

const TEST_FILE = path.join(__dirname, 'test-spreadsheet.xlsx');

function cleanup() {
    if (fs.existsSync(TEST_FILE)) {
        fs.unlinkSync(TEST_FILE);
    }
}

function makeSpreadsheet() {
    return new ThousandXspreadsheeT({
        STORAGE: TEST_FILE,
        ACTORS_SHEET_NAME: 'Actors',
        QUESTS_SHEET_NAME: 'Quests',
        SYSTEM_SHEET_NAME: 'System',
        DIALOGUES_SHEET_NAME: 'Dialogues',
        STRINGS_SHEET_NAME: 'Strings'
    });
}

async function testBasicReadWrite() {
    console.log('\n--- testBasicReadWrite ---');

    const spreadsheet = makeSpreadsheet();

    console.log('Testing getStrings() on empty sheet...');
    const strings = await spreadsheet.getStrings();
    console.log(`  Strings: ${Object.keys(strings).length} entries (expected 0)`);
    console.assert(Object.keys(strings).length === 0, 'Expected 0 strings initially');

    console.log('Testing appendStrings() without commit...');
    await spreadsheet.appendStrings({ 'test_key_1': 'Test Value 1', 'test_key_2': 'Test Value 2' });

    // File should NOT be written yet — reload from disk should still show 0 entries
    const spreadsheet2 = makeSpreadsheet();
    const stringsBeforeCommit = await spreadsheet2.getStrings();
    console.log(`  Strings before commit (fresh instance): ${Object.keys(stringsBeforeCommit).length} entries (expected 0)`);
    console.assert(Object.keys(stringsBeforeCommit).length === 0, 'File should not be written before commit()');

    console.log('Calling commit()...');
    await spreadsheet.commit();

    // Now a fresh instance should see the data
    const spreadsheet3 = makeSpreadsheet();
    const stringsAfterCommit = await spreadsheet3.getStrings();
    console.log(`  Strings after commit (fresh instance): ${Object.keys(stringsAfterCommit).length} entries (expected 2)`);
    console.assert(Object.keys(stringsAfterCommit).length === 2, 'Expected 2 strings after commit()');

    console.log('✅ testBasicReadWrite passed');
}

async function testCommitIdempotent() {
    console.log('\n--- testCommitIdempotent ---');

    const spreadsheet = makeSpreadsheet();
    await spreadsheet.getStrings(); // ensure workbook loaded

    console.log('Calling commit() with no pending writes (should be a no-op)...');
    await spreadsheet.commit(); // _dirty is false, should not throw

    console.log('Calling commit() twice after a write...');
    await spreadsheet.appendStrings({ 'idem_key': 'idem_value' });
    await spreadsheet.commit();
    await spreadsheet.commit(); // second call should be a no-op (not dirty)

    const spreadsheet2 = makeSpreadsheet();
    const strings = await spreadsheet2.getStrings();
    console.log(`  Strings: ${Object.keys(strings).length} entries (expected 3)`);
    console.assert(Object.keys(strings).length === 3, 'Expected 3 strings total');

    console.log('✅ testCommitIdempotent passed');
}

async function testDialogues() {
    console.log('\n--- testDialogues ---');

    const spreadsheet = makeSpreadsheet();

    console.log('Testing appendDialogues()...');
    await spreadsheet.appendDialogues({
        'test_dialogue_1': { actor: 'Test Actor', original: 'Hello world!', translated: 'Привет мир!' }
    });

    // Not committed yet — fresh instance should see 0
    const spreadsheet2 = makeSpreadsheet();
    const beforeCommit = await spreadsheet2.getDialogues();
    console.log(`  Dialogues before commit: ${Object.keys(beforeCommit).length} (expected 0)`);
    console.assert(Object.keys(beforeCommit).length === 0, 'Dialogues should not be on disk before commit');

    await spreadsheet.commit();

    const spreadsheet3 = makeSpreadsheet();
    const afterCommit = await spreadsheet3.getDialogues();
    console.log(`  Dialogues after commit: ${Object.keys(afterCommit).length} (expected 1)`);
    console.assert(Object.keys(afterCommit).length === 1, 'Expected 1 dialogue after commit');
    console.assert(afterCommit['test_dialogue_1'].actor === 'Test Actor', 'Actor mismatch');
    console.assert(afterCommit['test_dialogue_1'].original === 'Hello world!', 'Original mismatch');
    console.assert(afterCommit['test_dialogue_1'].translated === 'Привет мир!', 'Translated mismatch');

    console.log('Testing markDialogues() (no-op for local)...');
    await spreadsheet3.markDialogues(['test_dialogue_1'], '#FF0000', 'original');
    // markDialogues is a no-op for local, so no commit needed and _dirty stays false

    console.log('✅ testDialogues passed');
}

async function testReplaceAndCommit() {
    console.log('\n--- testReplaceAndCommit ---');

    const spreadsheet = makeSpreadsheet();

    // replaceStrings calls both updateRows and appendRows internally — both set _dirty
    await spreadsheet.replaceStrings({ 'test_key_1': 'Updated Value 1', 'new_key': 'New Value' });
    await spreadsheet.commit();

    const spreadsheet2 = makeSpreadsheet();
    const strings = await spreadsheet2.getStrings();
    console.log(`  Strings after replace+commit: ${Object.keys(strings).length} entries (expected 4)`);
    console.assert(Object.keys(strings).length === 4, 'Expected 4 strings after replace');
    console.assert(strings['test_key_1'] === 'Updated Value 1', 'Expected updated value for test_key_1');
    console.assert(strings['new_key'] === 'New Value', 'Expected new_key to be appended');

    console.log('✅ testReplaceAndCommit passed');
}

async function main() {
    console.log('Testing ThousandXspreadsheeT commit() behaviour...');
    cleanup();

    try {
        await testBasicReadWrite();
        await testCommitIdempotent();
        await testDialogues();
        await testReplaceAndCommit();

        console.log('\n✅ All tests passed!');
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        cleanup();
    }
}

main();
