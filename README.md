# 1000xTRANSLATE
A full toolset that will help you to translate [1000xRESIST](https://store.steampowered.com/app/1675830/1000xRESIST/) to your favourite language. Work in progress, the first major milestone is to be able to export, parse, translate and import all visible text data.


## The Idea
The toolset is intended to be used in the following way:
1. Toolset exports and parses what is needed from the game files you provide.
2. Toolset uploads all strings into a pre-defined [Google Sheets document](https://docs.google.com/spreadsheets/d/10KcHa_iS_RSgsVauCDe6EKbskN4iZfaT9PPjdGJk--4/edit?usp=sharing).
3. You translate all game text in Google Sheets, with optional help of LLMs.
4. Toolset pulls all translated strings and builds a ready to use distribution package with localization.


## Functions
| Function          | State | Description                                                         |
| ----------------- | ----- | ------------------------------------------------------------------- |
| Exporter          | ✅    | Exports required game data                                          |
| Sheetifier        | ✅    | Parses game data and imports all strings into Google Sheets         |
| Translator        | WIP   | (optional) Translates strings using LLMs                            |
| Checker           | TO DO | (optional) Checks for abnormalities in the strings                  |
| Desheetifier      | ✅    | Pulls all strings from Google Sheets and writes them into game data | 
| Boom Boom Build   | ✅    | Imports required game data, creates distribution packages           |

### Exporter
Exports required game data from `GAME_DIR` to `RES_DIR` using [UnityPy](https://github.com/K0lb3/UnityPy). It tries to be as version-agnostic as possible to support any patch version of the game (we'll see about that). Game files that we need are `resources.assets` and individual bundles listed in [the bundles list](data/bundles.list).

###  Sheetifier
Parses exported game data from `RES_DIR` into human-readable format, imports it into the pre-defined Google Sheets document (`SPREADSHEET_ID` and the rest). If there already were some strings, it appends only missing strings. The function tries to sort the strings into chapters (see [chapter definitions](data/chapter-definitions.json)). The name is non-negotiable.

### Translator
*(optional)* Automatically or semi-automatically translates untranslated strings from Google Sheets using vocabulary and context. Marks translated strings with red, because you probably don't want to have unedited machine translation.

### Checker
*(optional)* Checks for abnormalities in the strings using LLMs, creating a report of what was found.

### Desheetifier
Pulls translated strings from Google Sheets and inserts them into the game data.

### Boom Boom Build
Imports the build data into the game files, packs everything that was change for a distribution (I'll probably start with just a basic zip file, but TBD).


## Prerequisites
 - Linux/macOS (for now, Windows shouldn't be a problem with minor tweaks)
 - bash 3 or higher
 - node.js 20 or higher
 - python 3.9 or higher
 - uv, npm


## Installation & Usage
More thorough instruction will come later, when things are a bit more stable. For now:
1. Clone this repo to somewhere.
2. Install bash, node, python, uv.
3. Copy [Google Sheets document](https://docs.google.com/spreadsheets/d/10KcHa_iS_RSgsVauCDe6EKbskN4iZfaT9PPjdGJk--4/edit?usp=sharing) under your name.
4. Set up [a service account](https://console.cloud.google.com/), get a JSON file with credentials, share the document you copied with this service account's email.
5. Copy `.env.example` to `.env` and edit it.
6. Run `npm run check` to see if anything is wrong.
7. Run `npm run install` to install all needed internal dependencies.
8. Run `npm run init` to export what we need from the game, parse it an upload to the Google Sheets document.
9. Run `npm run build` to download current translation from the Google Sheet document and import it to the game files.


## Thanks
 - **K0lb3** for his work on UnityPy, without which none of this would've been possible
 - **VaDiM** and **idkwhatimsaying** for helping with typetree extraction
 - **turinar71** (who is the author of the Italian translation, btw) for some useful info
 - **K_A_S_a_L_E_X** for original data mining