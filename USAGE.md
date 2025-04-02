# Usage
The following assumes that you have completed everything in [INSTALL.md](INSTALL.md).


## Exporting and uploading strings to the spreadsheet
Run `npm run dump`. It's an alias for the following two commands:
 - `npm run function:exporter` to export game resources
 - `npm run function:sheetifier` to parse text resources and upload strings for translation to the spreadsheet

You can run them individually if needed. Already translated strings won't be touched, so it's safe to run it multiple times.


## Translating
You can translate everything manually or with the help of the included Translator (dialogues only). Note that having filled vocabularies (prefixed with `VOCAB:`) is a must if you want to achieve a translation of a reasonable quality.

Run `npm run translate` and follow the prompts to translate all untranslated dialogues. You can cancel it and then run again at any moment. Alternatively you can use the Function directly by running `npm run function:translator key_wildcard [force]`, where `key_wildcard` is a dialogue key wildcard to translate and `force` is a flag to enforce the translation of already translated strings.

For example, `npm run function:translator 'Dialogue/HighSchool_v2/*' force` will translate all dialogues with keys starting with `Dialogue/HighSchool_v2/` whether they already have a translation or not. Note that the wildcard support is limited and only applies to the key suffix, so something like `Dialogue/*/artroom/` would not work.

All strings translated that way will be marked with **red** in the spreadsheet.

Also see **LLM usage notes** below.


## Checking
In order to check your translated dialogues you can run `npm run check` (or `npm run function:checker`). This will send all your translated dialogues to LLM which will try to detect any anomalies. The process could be interrupted and then resumed at any moment. As a result, you'll get a report (should open automatically, but if it didn't look for `checker-report.htm` in the root dir). It will probably contain a lot of garbage, but treat it seriously and check all entries, it is able to notice things that remained undetected by several people.

Also see **LLM usage notes** below.


## Overriding the textures
After running the Exporter, you see the textures appear in your `TEXTURES_DIR`, you can pick any of these and copy them to your `OVERRIDES_DIR` for editing. Overrided textures should have the same format and dimensions as the original ones.


## Building the translation
Run `npm run build`. It's an alias for the following two commands:
 - `npm run function:desheetifier` to pull the strings from the spreadsheet and inject them into game resources
 - `npm run function:bbb` to import game resources into bundles

Again, you can run them individually if needed. The result would be the changed game files in your `OUT_DIR`, ready to be put into the game or distributed.


## Maintenance
Use `npm run clean` to clean exported and parsed resources.

Use `npm run clean:all` to also remove all installed dependencies in Functions and Misc.

None of the above would affect anything in your `DATA_DIR`, `OVERRIDES_DIR` or spreadsheet with translation.

Use `npm run init` to install required dependencies.

Use `npm run validate` to check the env file validity and all dependencies.


## Troubleshooting
In most common cases you will get a clear error stating what might be the issue, however bugs and incorrect configuration are obviously a thing too, so as a start try at least running `npm run clean:all` and `npm run init`. Double-checking your `.env` file could help as well.

Many Functions write detailed logs in the `Logs` directory, check them for more information.

If nothing helps, feel free to [create a new issue](https://github.com/deseven/1000xTRANSLATE/issues/new?body=Describe+the+problem+and+attach+anything+that+could+be+relevant+-+logs,+screenshots,+etc.&labels=question).


## LLM usage notes
Only Translator and Checker depend on LLMs, so if you don't plan to use them you can skip this.

The translation and checking really depend on the quality of the model you use. The models also have their own biases, so there is no universal solution for everything. Experimenting is a must. The prompts right now are hardcoded in the scripts, but I plan to allow overriding them in the future.

Now, how to pick the model. In general, DeepSeek V3 gives very good results and is cheap (if it's unavailable as usual, check for [alternative providers on OpenRouter](https://openrouter.ai/deepseek/deepseek-chat)). OpenAI's GPT-4o also gives decent results, so is Anthropic's Claude Haiku, but they are obviously much more expensive. The tasks are a bit too complicated for 4o-mini or other models of the same class, that's why I also can't recommend using local models, unless you can run at least a 30B (or better a 70B) one.

You can expect to spend from 1 to 5 bucks on translation and checking.


## Importing original Sunset Vistor script files
If you already started a translation using the files you got from the devs (two CSV files - System and Dialogue), the toolset includes the tool to transfer translated strings from that format. Upload what you have as a separate spreadsheet and define it as `SV_SPREADSHEET_ID` in your `.env` file, then run `npm run tool:svscript-convert`. The tool assumes that your translation would be in column F of the `System` and `Dialogue` sheets.