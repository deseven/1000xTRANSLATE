#!/bin/bash

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a file exists and is not empty
file_exists_and_not_empty() {
    [[ -s "$1" ]]
}

# Function to check if a directory exists and is not empty
dir_exists_and_not_empty() {
    [[ -d "$1" && -n "$(ls -A "$1")" ]]
}

# Function to check if a variable is set and not empty
var_not_empty() {
    [[ -n "$1" ]]
}

# Function to check if a path is a valid directory or can be created
valid_dir_or_creatable() {
    [[ -d "$1" ]] || (mkdir -p "$1" && rmdir "$1")
}

# Load .env file
if [[ -f .env ]]; then
    source .env
else
    echo -e "${RED}[CRITICAL]${NC} .env file does not exist or cannot be loaded."
    exit 1
fi

# Initialize error counters
critical_errors=0
warning_errors=0

# Check dependencies
dependencies=(
    "python:python3"
    "uv:uv"
    "node:node"
    "npm:npm"
)

echo "## Dependency Checks ##"
for dep in "${dependencies[@]}"; do
    dep_name=${dep%%:*}
    dep_cmds=${dep#*:}
    found=0
    for cmd in $dep_cmds; do
        if command_exists "$cmd"; then
            found=1
            break
        fi
    done
    if [[ $found -eq 0 ]]; then
        echo -e "${RED}[CRITICAL]${NC} $dep_name command not found."
        ((critical_errors++))
    else
        echo -e "${GREEN}[OK]${NC} $dep_name command found."
    fi
done

# Check environment variables
variables=(
    "SPREADSHEET_ID:WARNING:is not set or is empty."
    "GOOGLE_CREDENTIALS_FILE:WARNING:file does not exist or is empty."
    "VOCAB_CHARS_SHEET_NAME:WARNING:is not set or is empty."
    "VOCAB_TERMS_SHEET_NAME:WARNING:is not set or is empty."
    "SYSTEM_SHEET_NAME:WARNING:is not set or is empty."
    "DIALOGUE_SHEET_NAME:WARNING:is not set or is empty."
    "GAME_DATA_DIR:CRITICAL:directory does not exist or is empty."
    "GAME_UNITY_VERSION:CRITICAL:is not set or is empty."
    "RES_DIR:CRITICAL:is not a valid directory or cannot be created."
    "OUT_DIR:CRITICAL:is not a valid directory or cannot be created."
    "BASE_LANG:CRITICAL:is not a valid 2-symbol [a-z] code."
    "OPENAI_API_ENDPOINT:WARNING:does not start with 'http'."
    "OPENAI_API_KEY:WARNING:is not set or is empty."
    "OPENAI_MODEL:WARNING:is not set or is empty."
)

echo

echo "## Variable Checks ##"
for var in "${variables[@]}"; do
    var_name=${var%%:*}
    severity=${var#*:}; severity=${severity%%:*}
    message=${var#*:*:}
    value=$(eval echo \$$var_name)
    if ! var_not_empty "$value"; then
        if [[ $severity == "CRITICAL" ]]; then
            echo -e "${RED}[CRITICAL]${NC} $var_name $message"
            ((critical_errors++))
        else
            echo -e "${YELLOW}[WARNING]${NC} $var_name $message"
            ((warning_errors++))
        fi
    else
        case $var_name in
            "GOOGLE_CREDENTIALS_FILE")
                if ! file_exists_and_not_empty "$value"; then
                    if [[ $severity == "CRITICAL" ]]; then
                        echo -e "${RED}[CRITICAL]${NC} $var_name $message"
                        ((critical_errors++))
                    else
                        echo -e "${YELLOW}[WARNING]${NC} $var_name $message"
                        ((warning_errors++))
                    fi
                else
                    echo -e "${GREEN}[OK]${NC} $var_name is set and file exists."
                fi
                ;;
            "GAME_DATA_DIR")
                if ! dir_exists_and_not_empty "$value"; then
                    echo -e "${RED}[CRITICAL]${NC} $var_name $message"
                    ((critical_errors++))
                else
                    echo -e "${GREEN}[OK]${NC} $var_name is set and directory exists."
                fi
                ;;
            "RES_DIR"|"OUT_DIR")
                if ! valid_dir_or_creatable "$value"; then
                    echo -e "${RED}[CRITICAL]${NC} $var_name $message"
                    ((critical_errors++))
                else
                    echo -e "${GREEN}[OK]${NC} $var_name is set and directory is valid or can be created."
                fi
                ;;
            "BASE_LANG")
                if ! [[ $value =~ ^[a-z]{2}$ ]]; then
                    echo -e "${RED}[CRITICAL]${NC} $var_name $message"
                    ((critical_errors++))
                else
                    echo -e "${GREEN}[OK]${NC} $var_name is set and valid."
                fi
                ;;
            "OPENAI_API_ENDPOINT")
                if ! [[ $value =~ ^http ]]; then
                    if [[ $severity == "CRITICAL" ]]; then
                        echo -e "${RED}[CRITICAL]${NC} $var_name $message"
                        ((critical_errors++))
                    else
                        echo -e "${YELLOW}[WARNING]${NC} $var_name $message"
                        ((warning_errors++))
                    fi
                else
                    echo -e "${GREEN}[OK]${NC} $var_name is set and valid."
                fi
                ;;
            *)
                echo -e "${GREEN}[OK]${NC} $var_name is set."
                ;;
        esac
    fi
done

echo

echo "## Final Status ##"

# Exit based on critical errors
if [[ $critical_errors -gt 0 ]]; then
    echo -e "${RED}There are critical errors, please fix them first.${NC}"
    echo
    exit 1
elif [[ $warning_errors -gt 0 ]]; then
    echo -e "${YELLOW}Encountered several non-critical errors.${NC}"
    echo
else
    echo -e "${GREEN}All seems to be in order :)${NC}"
    echo
    exit 0
fi
