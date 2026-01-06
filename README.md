# 1000xTRANSLATE
A full toolset that will help you to translate [1000xRESIST](https://store.steampowered.com/app/1675830/1000xRESIST/) to your favourite language.

**There is now a `1000xr-modding` channel on the official [sunset visitor Discord](https://discord.gg/sunsetvisitor), feel free to join and say hi if you're planning to translate the game.**

> [!IMPORTANT]
> The toolset currently supports only game build 14633930 (v.1.15554, 13 Jun 2024) or earlier, the newest build 20610998 (4 Nov 2025) is not supported.

## The Idea
The toolset is intended to be used in the following way:
1. Toolset exports and parses what is needed from the game files you provide.
2. Toolset uploads all strings into a pre-defined [Google Sheets document](https://docs.google.com/spreadsheets/d/10KcHa_iS_RSgsVauCDe6EKbskN4iZfaT9PPjdGJk--4/edit?usp=sharing) or uses a local Excel file.
3. You translate all game text in Google Sheets or local file, with optional help of LLMs.
4. Toolset pulls all translated strings and builds a ready to use distribution package with localization.

> [!NOTE]
> While this toolset makes the translation 1000 times easier, unfortunately you still need to have solid computer usage skills to set it up.


## Roadmap
 - ~~be able to export, parse, translate and import all visible text data~~
 - ~~translator/checker~~
 - fonts patching
 - ~~general polishing & documentation~~
 - ~~texture~~ and other resources overrides (?)


## Functions
| Function          | State | Description                                                         |
| ----------------- | ----- | ------------------------------------------------------------------- |
| Exporter          | ✅    | Exports required game data                                          |
| Sheetifier        | ✅    | Parses game data and imports all strings into Google Sheets         |
| Translator        | ✅    | (optional) Translates dialogues using LLMs                          |
| Checker           | ✅    | (optional) Checks for abnormalities in the translated dialogues     |
| Desheetifier      | ✅    | Pulls all strings from Google Sheets and writes them into game data | 
| Boom Boom Build   | ✅    | Imports required game data, creates distribution packages           |

### Exporter
Exports required game data from `GAME_DIR` to `RES_DIR` using [UnityPy](https://github.com/K0lb3/UnityPy). Game files that we need are `resources.assets` and individual bundles listed in [the bundles list](data/bundles.list).

### Sheetifier
Parses exported game data from `RES_DIR` into human-readable format, imports it into the pre-defined Google Sheets document (`SPREADSHEET_ID` and the rest) or local file. If there already were some strings, it appends only missing strings. The function tries to sort the strings into chapters (see [chapter definitions](data/chapter-definitions.json)). The name is non-negotiable.

### Translator
*(optional)* Automatically or semi-automatically translates untranslated dialogues from Google Sheets using vocabulary and context. Marks translated strings with red (GSheets only), because you probably don't want to have unedited machine translation.

### Checker
*(optional)* Checks for anomalies in the dialogues using LLMs, creating a report of what was found.

### Desheetifier
Pulls translated strings from Google Sheets or local file and inserts them into the game data in `RES_DIR`.

### Boom Boom Build
Imports resources from `RES_DIR` into the game files, outputs changed bundles ready to be replaced in the game directory.


## Prerequisites
 - a copy of game files (everything under `1000xRESIST_Data`)
 - Linux/macOS/Windows
 - node.js 20 or higher
 - python 3.9 or higher


## Installation
See [INSTALL.md](INSTALL.md) for installation instructions.  
See [UPDATE.md](UPDATE.md) for update instructions if you're already using the toolset and want to update to the latest version.

## Usage
See [USAGE.md](USAGE.md) for usage instructions.


## Thanks
 - **K0lb3** for his work on UnityPy, without which none of this would've been possible
 - **VaDiM** and **idkwhatimsaying** for helping with typetree extraction
 - **turinar71** (who is the author of the Italian translation, btw) for some useful info
 - **K_A_S_a_L_E_X** for original data mining
 - **F3rn4n** for making a list of textures for translation