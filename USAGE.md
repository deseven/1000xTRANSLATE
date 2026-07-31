# Usage
The following assumes that you have completed everything in [INSTALL.md](INSTALL.md).


## Exporting and uploading strings to the spreadsheet
Run `npm run dump`. It's an alias for the following two commands:
 - `npm run function:exporter` to export game resources
 - `npm run function:sheetifier` to parse text resources and upload strings for translation to the spreadsheet

You can run them individually if needed. Already translated strings won't be touched, so it's safe to run it multiple times.


## Translating
You can translate everything manually or with the help of the included Translator (dialogues only). Note that having filled vocabularies (prefixed with `VOCAB-`) is a must if you want to achieve a translation of a reasonable quality.

Run `npm run translate` and follow the prompts to translate all untranslated dialogues. You can cancel it and then run again at any moment. Alternatively you can use the Function directly by running `npm run function:translator key_wildcard [force]`, where `key_wildcard` is a dialogue key wildcard to translate and `force` is a flag to enforce the translation of already translated strings.

For example, `npm run function:translator 'Dialogue/HighSchool_v2/*' force` will translate all dialogues with keys starting with `Dialogue/HighSchool_v2/` whether they already have a translation or not. Note that the wildcard support is limited and only applies to the key suffix, so something like `Dialogue/*/artroom/` would not work.

All strings translated that way will be marked with **red** in the spreadsheet (only applicable to GSheets).

Also see **LLM usage notes** below.


## Checking
In order to check your translated dialogues you can run `npm run check` (or `npm run function:checker`). This will send all your translated dialogues to LLM which will try to detect any anomalies. The process could be interrupted and then resumed at any moment. As a result, you'll get a report (should open automatically, but if it didn't look for `checker-report.htm` in the root dir). It will probably contain a lot of garbage, but treat it seriously and check all entries, it is able to notice things that remained undetected by several people.

Also see **LLM usage notes** below.


## Overriding the textures
After running the Exporter, you see the textures appear in your `TEXTURES_DIR`, you can pick any of these and copy them to your `OVERRIDES_DIR` for editing. Overrided textures should have the same format and dimensions as the original ones.


## Overriding TextMeshPro objects (`Strings` sheet)
Sometimes a translated string doesn't fit into the constraints of a TextMeshPro object (font size, margins, alignment and so on) and the object itself has to be adjusted. Since the same object is often copypasted between levels - and the game also reuses TMPs with byte-identical parameters on completely different signs - the toolset matches objects by SIMILARITY and can override ALL matching copies at once.

Run `npm run tool:override-TMP -- <min_similarity 0.1-1.0> "<exact original string>"`. The tool scans all scene bundles for world-space TextMeshPro objects with that exact string, groups identical ones, clusters the groups by similarity (every cluster member scores at least `min_similarity` against every other) and exports one JSON per cluster into `$OVERRIDES_DIR/TMP` as `{string} - {parent}.json` (numbered `-2`, `-3` and so on when several clusters share the same parent name - filenames are only for your orientation, matching never depends on them). Existing files are never overwritten - remove them first if you want to re-export.

The similarity score covers all TMP typography/geometry params (font size, margins, alignment, wrapping, etc.) plus the placement of the GameObject the TMP is attached to relative to its parent (typically a sign): position/rotation/scale and - for TMPs using a RectTransform - also `m_AnchoredPosition`, `m_SizeDelta`, `m_Pivot` and `m_AnchorMin/Max`. The latter are what actually positions text on most signs: the game reuses byte-identical TMP clones on different signs, and the RectTransform fields are often the ONLY thing telling them apart. `1.0` means an exact match of everything, lower values also match "almost the same" objects (e.g. copy-paste float noise in positions). A good starting point is `0.99`; use `1.0` if you only want byte-identical objects. A different string always scores 0, so overrides never leak onto other texts.

Each exported file contains:
- `min_similarity` - the threshold (the CLI value; edit it to re-tune matching without re-exporting);
- `chain` - informational only: the ancestor GameObject names of the reference object, i.e. which sign the file was exported from (one file may legitimately cover several different signs);
- `match` - the reference object the similarity is computed against, as found in the original game files. Editing it re-targets which objects get patched. You may also DELETE fields you don't care about (or the whole `transform` block): only the listed fields participate in the score, everything else matches anything - `m_text` is the only mandatory field. Note that the score is then computed from the remaining fields alone (e.g. with only `m_fontSize` listed, the score is `1 - |size difference| / 10`, so set the threshold accordingly);
- `patch` - what gets applied to every matched object: typography fields and/or the local position/rotation/scale in `transform`. It starts EMPTY on export, so nothing is overwritten by default - copy the fields you want to change from `match` into `patch` and edit them there. Only the fields present here are applied, everything else stays as-is in each matched object.

Run the build as usual. BBB scores every TMP object against every override of the same string and applies the best-scoring one that reaches its threshold - typography fields onto the TMP object, `transform` onto the Transform of its GameObject - before the regular string replacement pass. The string replacement still runs afterwards, so if you left `m_text` untouched it gets translated as usual; if you changed it, your text wins (unless it happens to match another translated string).


## Overriding the fonts
The game ships 13 fonts. You can replace any of them with your own font file by placing it in your `OVERRIDES_DIR`.

The override file's base name (without extension) must **exactly match** the name of the target `Font` object, and the extension must be either `.ttf` or `.otf`.

The available font names are:

| Name | Format |
|----------|--------|
| `NotoSansJP-Thin` | TTF |
| `NotoSansKR-Thin` | TTF |
| `NotoSansHK-Thin` | OTF |
| `NotoSansHK-Regular` | OTF |
| `NotoSansSC-Thin` | TTF |
| `Jura-Regular` | TTF |
| `Jura-Light` | TTF |
| `Jura-Medium` | TTF |
| `Rajdhani-Medium` | TTF |
| `Rajdhani-Regular` | TTF |
| `LiberationSans` | TTF |
| `PerfectDOSVGA437` | TTF |
| `PC-Filled` | TTF |

For example, to replace the font `Jura-Regular` with your own TTF, place a file named `Jura-Regular.ttf` in your `OVERRIDES_DIR`.


## Building the translation
Run `npm run build`. It's an alias for the following two commands:
 - `npm run function:desheetifier` to pull the strings from the spreadsheet and write them as translation patches
 - `npm run function:bbb` to merge the patches into the original game files (only translated text fields are modified)

Again, you can run them individually if needed. The result would be the changed game files in your `OUT_DIR`, ready to be put into the game or distributed.


### Creating a standalone patcher
By default, BBB outputs patched game bundle files — these are large, tied to a specific game version, and distributing them may be legally questionable. As an alternative, you can set `CREATE_PATCHER=true` in your `.env` to produce a **standalone patcher** instead.

In this mode, BBB builds a self-contained executable and packages it together with only the modified resources (JSON patches and texture overrides). End users then run the patcher against their own copy of the game, so no actual game files are ever distributed.

> [!NOTE]
> The patcher can only be built for the platform you are currently running on. Cross-platform builds are not supported.

The patcher could be run like this:
```
patcher <game_directory>
```
where `<game_directory>` is the root folder of the 1000xRESIST installation (the folder that contains the `1000xRESIST_Data` sub-folder). The patcher applies all changes directly into the game directory in-place. Ideally, you would also build an installation package (using [NSIS](https://nsis.sourceforge.io/) for example) that would automate all of that for the end users.

On Windows, the patcher can also be run without arguments (e.g. by double-clicking it): a file dialog will ask the user to pick `1000xRESIST.exe`, and the console window will stay open afterwards so the output can be read.

#### Patcher output format
The patcher's progress output is machine-readable, so an external installer can display a percentage indicator while applying the patch. The output is split into four sections, one per import step, always printed in the same order:

```
Importing core resources.
[1:#]

Importing strings.
[120:###########################################...]

Importing dialogues.
[45:##################...]

Importing textures.
[30:#######...]
```

Each section starts with the step name on its own line, followed by a progress line in the form `[{actions_num}:{indicator}]`, where:
 - `actions_num` is the total number of actions for the step: `1` for core resources (I2Languages and fonts are patched in the single `resources.assets` file), and the number of bundles that have to be processed for strings, dialogues and textures;
 - `indicator` is a stream of `#` characters printed as the work advances — one `#` per completed action, forming a growing progress bar. The step is finished when the number of `#` characters equals `actions_num` and the closing `]` is printed.

A step that has nothing to do (e.g. textures when the patcher is bundled without overrides) is reported as `[0:]`. After all sections, a `[SUMMARY]` block with the totals is printed. Note that if an error occurs mid-step, the progress line for that step is left unclosed and the error message is printed instead — treat a non-zero exit code as a failure.


## Maintenance
Use `npm run clean` to clean exported and parsed resources.

Use `npm run clean:all` to also remove all installed dependencies in Functions and Misc.

None of the above would affect anything in your `DATA_DIR`, `OVERRIDES_DIR` or spreadsheet with translation.

Use `npm run init` to install required dependencies.

Use `npm run validate` to check the env file validity and all dependencies.

> [!CAUTION]
> If you're using local XLSX file, make sure to backup it regularly (or put under version control), otherwise you're risking to lose all your work in case something glitches out!


## Troubleshooting
In most common cases you will get a clear error stating what might be the issue, however bugs and incorrect configuration are obviously a thing too, so as a start try at least running `npm run clean:all` and `npm run init`. Double-checking your `.env` file could help as well.

Many Functions write detailed logs in the `Logs` directory, check them for more information.

If nothing helps, feel free to [create a new issue](https://github.com/deseven/1000xTRANSLATE/issues/new?body=Describe+the+problem+and+attach+anything+that+could+be+relevant+-+logs,+screenshots,+etc.&labels=question).


## LLM usage notes
Only Translator and Checker depend on LLMs, so if you don't plan to use them you can skip this.

The translation and checking really depend on the quality of the model you use. The models also have their own biases, so there is no universal solution for everything. Experimenting is a must. The prompts right now are hardcoded in the scripts, but I plan to allow overriding them in the future.

Now, how to pick the model. In general, DeepSeek V3 gives very good results and is cheap (if it's unavailable as usual, check for [alternative providers on OpenRouter](https://openrouter.ai/deepseek/deepseek-chat)). OpenAI's GPT-4o also gives decent results, so is Anthropic's Claude Haiku, but they are obviously much more expensive. The tasks are a bit too complicated for 4o-mini or other models of the same class, that's why I also can't recommend using local models, unless you can run at least a 30B (or better a 70B) one.

You can expect to spend from 1 to 5 USD on translation and checking.


## Importing original Sunset Vistor script files
If you already started a translation using the files you got from the devs (two CSV files - System and Dialogue), the toolset includes the tool to transfer translated strings from that format. Upload what you have as a separate spreadsheet and define it as `SV_SPREADSHEET_ID` in your `.env` file, then run `npm run tool:svscript-convert`. The tool assumes that your translation would be in column F of the `System` and `Dialogue` sheets.


## Sorting dialogues in the natural order
Dialogue entries in the game files are linked together (each entry points to the next one), and this link order often differs from the numeric id order. Fresh imports via Sheetifier are added in the natural (conversation flow) order automatically. To reorder dialogues that are already in your storage, run `npm run tool:sort-dialogues` (requires the exported resources in `RES_DIR`). Rows are physically moved, so your notes, comments and color fills stay attached to their rows. Keys that can't be found in the exported dialogue databases keep their relative order and stay at the end of their current block. You can run `npm run tool:sort-dialogues-dry-run` to only see how many rows would be moved without changing anything.