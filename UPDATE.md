# Update
**If you cloned the toolset with git:**  
Do a `git pull`.

**If you downloaded a tagged release:**  
Download a new one from releases and unpack to the same dir, replacing all files.

After that do `npm run clean:all` followed by `npm run init`, `npm run validate` and `npm run dump`. I'll try to keep backwards compatibility as much as possible. Additional instructions for specific updates listed below.

## Updating to 26.8
Dialogues are now ordered by the actual conversation flow (following the links between dialogue entries) instead of the numeric id order. New imports get the natural order automatically, existing rows in your storage are left untouched. If you want to reorder dialogues that are already in your storage, run `npm run tool:sort-dialogues` (or `npm run tool:sort-dialogues-dry-run` first to see how many rows would be moved). Your notes, comments and color fills will stay attached to their rows.

## Updating to 26.7
`GAME_UNITY_VERSION` is now deprecated and can be removed from your `.env` (not required).

## Updating to 26.3
Version 26.3 is the first version with changes required to support the new game patch released on the 4th of November 2025. Earlier patches are **NO LONGER SUPPORTED**, so in case you're targeting some earlier game version you better stay at 26.2.

In your `.env` file replace `GAME_UNITY_VERSION` value with `6000.1.10f1`.

## Updating to 26.1 or 26.2
Version 26.1 introduces ability to use local XLSX file as a storage. Due to the limitations of the format, the usage of `:` in sheet names is no longer possible.

If you want to keep using Google Sheets:
1. Replace `:` in your sheet names with `-`, so for example if you have `VOCAB:Chars` it needs to be renamed to `VOCAB-Chars`.
2. Add a new variable to your `.env` - `STORAGE=GOOGLE`.

If you want to switch to local XLSX file:
1. Replace `:` in your sheet names with `-`, so for example if you have `VOCAB:Chars` it needs to be renamed to `VOCAB-Chars`.
2. Export your Google Sheet to XLSX (File > Download > Microsoft Excel), save the file with any name at any location.
3. Add a new variable to your `.env` - `STORAGE=file.xlsx`, where `file.xlsx` is relative or absolute path to your downloaded file.

If you already started your translation on 26.1 or 26.2 none of the above is needed.