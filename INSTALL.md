# Installation

## Linux/macOS
1. Install Git, Node.js LTS and Python 3.9 or higher with your favourite package manager.
2. Run `git clone https://github.com/deseven/1000xTRANSLATE.git`
3. Run `cd 1000xTRANSLATE`.
4. Copy `.env.example` to `.env` and edit it, following the comments. As a bare minimum, you should define `SPREADSHEET_ID`, `GOOGLE_CREDENTIALS_FILE` (see below) and `GAME_DATA_DIR`.
5. Run `npm install` to install wrapper script dependencies.
6. Run `npm run init` to install all needed internal dependencies.
7. Run `npm run check` to see if anything is wrong.

## Windows
1. Run Power Shell from Start Menu or in Windows Terminal.
2. Run `winget install Git.Git OpenJS.NodeJS.LTS Python.Python.3.9` and wait for the installation to complete. If your system doesn't have `winget` (early versions of Windows 10 or older), install all of that manually.
3. Open a new instance of Power Shell to apply new PATH.
4. Check that `git --version`, `node --version` and `python --version` commands work.
5. Run `git clone https://github.com/deseven/1000xTRANSLATE`.
6. Run `cd 1000xTRANSLATE`.
7. Run `cp .env.example .env`.
8. Edit `.env` file in any text editor, following the comments in it. As a bare minimum, you should define `SPREADSHEET_ID`, `GOOGLE_CREDENTIALS_FILE` (see below) and `GAME_DATA_DIR` (for example `C:\Steam\steamapps\common\1000xRESIST\1000xRESIST_Data`).
9. Run `npm install` to install wrapper script dependencies.
10. Run `npm run init` to install all needed internal dependencies.
11. Run `npm run check` to see if anything is wrong.
12. To make the usage easier, you can also create a shortcut to `1000xTRANSLATE.bat` on your desktop, it's a simple script that will prompt you to pick from a predefined set of 

## Prepare Google Sheets document
 - Copy [Google Sheets document](https://docs.google.com/spreadsheets/d/10KcHa_iS_RSgsVauCDe6EKbskN4iZfaT9PPjdGJk--4/edit?usp=sharing) under your name.
 - Set up [a service account](https://console.cloud.google.com/) (google "How to set up service account to access google sheets" if you're not sure how to do that, [here is one example](https://stackoverflow.com/a/76838253)), save a JSON file with credentials to 1000xTRANSLATE dir and share the document you copied with this service account's email.


# Update
A simple `git pull` should do. I'll try to keep backwards compatibility as much as possible.