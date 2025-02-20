# Usage
The following assumes that you have completed everything in [INSTALL.md](INSTALL.md).


## Exporting and uploading strings to the spreadsheet
Run `npm run dump`. It's an alias for the following two commands:
 - `npm run function:exporter` to export game resources
 - `npm run function:sheetifier` to parse text resources and upload strings for translation to the spreadsheet
You can run them individually if needed. Already translated strings won't be touched, so it's safe to run it multiple times.


## Translating
You can translate everything manually or with the help of the included Translator (dialogues only).
Run `npm run translate` and follow the prompts to translate all untranslated dialogues.

Alternatively you can use the Function directly by running `npm run function:translator key_wildcard [force]`, where `key_wildcard` is a dialogue key wildcard to translate and `force` is a flag to enforce the translation of already translated strings.

For example, `npm run function:translator 'Dialogue/HighSchool_v2/*' force` will translate all dialogues with keys starting with `Dialogue/HighSchool_v2/` whether they already have a translation or not. Note that the wildcard support is limited and only applies to the key suffix, so something like `Dialogue/*/artroom/` would not work.

All strings translated that way will be marked with red in the spreadsheet.


## Overriding the textures
After running the Exporter, you see the textures appear in your `TEXTURES_DIR`, you can pick any of these and copy them to your `OVERRIDES_DIR` for editing. Overrided textures should have the same format and dimensions as the original ones.


## Building the translation
Run `npm run build`. It's an alias for the following two commands:
 - `npm run function:desheetifier` to pull the strings from the spreadsheet and inject them into game resources
 - `npm run function:bbb` to import game resources into bundles
Again, you can run them individually if needed. The result would be the changed game files in your `OUT_DIR`, ready to be put into the game or distributed.


## Cleaning up
Use `npm run clean` to clean exported and parsed resources.
Use `npm run clean:all` to also remove all installed dependencies in Functions and Misc.
None of the above would affect anything in your `DATA_DIR`, `OVERRIDES_DIR` and spreadsheet.


## Importing original Sunset Vistor script files
If you already started a translation using the files you got from the devs (two CSV files - System and Dialogue), the toolset includes the tool to transfer translated strings from that format. Upload what you have as a separate spreadsheet and define it as `SV_SPREADSHEET_ID` in your `.env` file, then run `npm run tool:svscript-convert`. The tool assumes that your translation would be in column F of the `System` and `Dialogue` sheets.