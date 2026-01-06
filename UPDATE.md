# Update
A simple `git pull` followed by `npm run init` and `npm run validate` should do. I'll try to keep backwards compatibility as much as possible. Additional instructions for specific updates listed below.

## Updating to Jan 6 2026 version (tag 060126)
This version introduces ability to use local XLSX file as a storage. Due to the limitations of the format, the usage of `:` in sheet names is no longer possible.

If you want to keep using Google Sheets:
1. Replace `:` in your sheet names with `-`, so for example if you have `VOCAB:Chars` it needs to be renamed to `VOCAB-Chars`.
2. Add a new variable to your `.env` - `STORAGE=GOOGLE`.

If you want to switch to local XLSX file:
1. Replace `:` in your sheet names with `-`, so for example if you have `VOCAB:Chars` it needs to be renamed to `VOCAB-Chars`.
2. Export your Google Sheet to XLSX (File > Download > Microsoft Excel), save the file with any name at any location.
3. Add a new variable to your `.env` - `STORAGE=file.xlsx`, where `file.xlsx` is relative or absolute path to your downloaded file.