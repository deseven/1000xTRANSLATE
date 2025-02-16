#!/bin/bash

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Dependencies to check for (name:commands)
dependencies=(
    "python:python3 uv"
    "node:node npm"
)

# Variables to check for (var:severity:function:error)
variables=(
    "SPREADSHEET_ID            :CRITICAL :                          :"
    "GOOGLE_CREDENTIALS_FILE   :CRITICAL :file_exists_and_not_empty :file does not exist or is empty."
    "VOCAB_CHARS_SHEET_NAME    :CRITICAL :                          :"
    "VOCAB_TERMS_SHEET_NAME    :CRITICAL :                          :"
    "SYSTEM_SHEET_NAME         :CRITICAL :                          :"
    "ACTORS_SHEET_NAME         :CRITICAL :                          :"
    "QUESTS_SHEET_NAME         :CRITICAL :                          :"
    "DIALOGUES_SHEET_NAME      :CRITICAL :                          :"
    "GAME_DATA_DIR             :CRITICAL :dir_exists_and_not_empty  :directory does not exist or is empty."
    "GAME_UNITY_VERSION        :CRITICAL :                          :"
    "UNITYPY_USE_PYTHON_PARSER :WARNING  :equals_to_true_or_false   :does not equal to \'true\' or \'false\'."
    "RES_DIR                   :CRITICAL :valid_dir_or_creatable    :is not a valid directory or cannot be created."
    "OUT_DIR                   :CRITICAL :valid_dir_or_creatable    :is not a valid directory or cannot be created."
    "BASE_LANG                 :CRITICAL :check_lang_code           :is not a valid 2-symbol [a-z] code."
    "TARGET_LANG               :CRITICAL :check_lang_code           :is not a valid 2-symbol [a-z] code."
    "OPENAI_API_ENDPOINT       :WARNING  :check_starts_with_http    :does not start with 'http'."
    "OPENAI_API_KEY            :WARNING  :                          :"
    "OPENAI_MODEL              :WARNING  :                          :"
)

# Check functions
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

file_exists_and_not_empty() {
    [[ -s "$1" ]]
}

dir_exists_and_not_empty() {
    [[ -d "$1" && -n "$(ls -A "$1")" ]]
}

var_not_empty() {
    [[ -n "$1" ]]
}

valid_dir_or_creatable() {
    [[ -d "$1" ]] || (mkdir -p "$1" && rmdir "$1")
}

check_lang_code() {
    [[ "$1" =~ ^[a-z]{2}$ ]]
}

check_starts_with_http() {
    [[ "$1" =~ ^http ]]
}

equals_to_true_or_false() {
    [[ "$1" =~ ^(true|false)$ ]]
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

# Dependency checks
echo "## Dependency Checks ##"
for dep in "${dependencies[@]}"; do
    dep_name=${dep%%:*}
    dep_cmds=${dep#*:}
    missing_cmds=""
    for cmd in $dep_cmds; do
        if ! command_exists "$cmd"; then
            missing_cmds+=" $cmd"
        fi
    done
    if [[ -n "$missing_cmds" ]]; then
        echo -e "${RED}[CRITICAL]${NC} $dep_name missing commands:$missing_cmds"
        ((critical_errors++))
    else
        echo -e "${GREEN}[OK]${NC} $dep_name commands found."
    fi
done

echo

# Variable checks
echo "## Variable Checks ##"
for var in "${variables[@]}"; do
    IFS=':' read -r var_name severity check_func message <<< "$var"

    # Trim whitespace from each field
    var_name=$(echo "$var_name" | xargs)
    severity=$(echo "$severity" | xargs)
    check_func=$(echo "$check_func" | xargs)
    message=$(echo "$message" | xargs)

    value=$(eval echo "\$$var_name")
    
    # Set default error message if not provided
    if [[ -z "$message" ]]; then
        if [[ -z "$check_func" ]]; then
            message="is not set or is empty."
        else
            message="failed validation check."
        fi
    fi
    
    if ! var_not_empty "$value"; then
        if [[ $severity == "CRITICAL" ]]; then
            echo -e "${RED}[CRITICAL]${NC} $var_name $message"
            ((critical_errors++))
        else
            echo -e "${YELLOW}[WARNING]${NC} $var_name $message"
            ((warning_errors++))
        fi
    else
        if [[ -n "$check_func" ]]; then
            if ! $check_func "$value"; then
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
        else
            echo -e "${GREEN}[OK]${NC} $var_name is set."
        fi
    fi
done

echo
echo "## Final Status ##"

if [[ $critical_errors -gt 0 ]]; then
    echo -e "${RED}There are critical errors, please fix them first.${NC}"
    echo
    exit 1
elif [[ $warning_errors -gt 0 ]]; then
    echo -e "${YELLOW}Encountered several non-critical errors.${NC}"
else
    echo -e "${GREEN}All seems to be in order :)${NC}"
fi

echo