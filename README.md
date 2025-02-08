
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
| Exporter          | works | Exports required game data                                          |
| Sheetifier        | WIP   | Parses game data and imports all strings into Google Sheets         |
| Translator        | WIP   | (optional) Translates strings using LLMs                            |
| Checker           | TO DO | (optional) Checks for abnormalities in the strings                  |
| Desheetifier      | WIP   | Pulls all strings from Google Sheets and writes them into game data | 
| Boom Boom Build   | TO DO | Imports required game data, creates distribution packages           |

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
 - bash 3 or higher
 - node.js 20 or higher
 - python 3.9 or higher
 - uv, npm


## Installation & Usage
TODO: later, when things are a bit more stable
