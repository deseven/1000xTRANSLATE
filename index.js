import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
try {
    dotenv.config();
} catch (error) {
    console.error(chalk.red('[CRITICAL]'), '.env file does not exist or cannot be loaded.');
    process.exit(1);
}

// Variable definitions
const variables = {
    SPREADSHEET_ID: {
        required_by: ['function:2-sheetifier', 'function:3-translator', 'function:4-checker', 'function:5-desheetifier', 'tool:svscript-convert']
    },
    GOOGLE_CREDENTIALS_FILE: {
        required_by: ['function:2-sheetifier', 'function:3-translator', 'function:4-checker', 'function:5-desheetifier', 'tool:svscript-convert'],
        check: 'fileExistsAndNotEmpty',
        message: 'file does not exist or is empty'
    },
    VOCAB_CHARS_SHEET_NAME: {
        required_by: ['function:2-sheetifier', 'function:3-translator', 'tool:svscript-convert']
    },
    VOCAB_TERMS_SHEET_NAME: {
        required_by: ['function:2-sheetifier', 'function:3-translator']
    },
    SYSTEM_SHEET_NAME: {
        required_by: ['function:2-sheetifier', 'function:5-desheetifier']
    },
    ACTORS_SHEET_NAME: {
        required_by: ['function:2-sheetifier', 'function:5-desheetifier']
    },
    QUESTS_SHEET_NAME: {
        required_by: ['function:2-sheetifier', 'function:5-desheetifier']
    },
    DIALOGUES_SHEET_NAME: {
        required_by: ['function:2-sheetifier', 'function:3-translator', 'function:4-checker', 'function:5-desheetifier']
    },
    STRINGS_SHEET_NAME: {
        required_by: ['function:2-sheetifier', 'function:5-desheetifier']
    },
    GAME_DATA_DIR: {
        required_by: ['function:1-exporter', 'function:6-boom-boom-build'],
        check: 'dirExistsAndNotEmpty',
        message: 'directory does not exist or is empty'
    },
    GAME_UNITY_VERSION: {
        required_by: ['function:1-exporter', 'function:6-boom-boom-build']
    },
    UNITYPY_USE_PYTHON_PARSER: {
        required_by: [],
        check: 'equalsTrueOrFalse',
        message: "does not equal to 'true' or 'false'"
    },
    RES_DIR: {
        required_by: ['function:1-exporter', 'function:6-boom-boom-build'],
        check: 'validDirOrCreatable',
        message: 'is not a valid directory or cannot be created'
    },
    TEXTURES_DIR: {
        required_by: ['function:1-exporter'],
        check: 'validDirOrCreatable',
        message: 'is not a valid directory or cannot be created'
    },
    OVERRIDES_DIR: {
        required_by: [],
        check: 'validDirOrCreatable',
        message: 'is not a valid directory or cannot be created'
    },
    OUT_DIR: {
        required_by: ['function:6-boom-boom-build'],
        check: 'validDirOrCreatable',
        message: 'is not a valid directory or cannot be created'
    },
    BASE_LANG: {
        required_by: ['function:2-sheetifier'],
        check: 'checkLangCode',
        message: 'is not a valid 2-symbol [a-z] code'
    },
    TARGET_LANG: {
        required_by: ['function:5-desheetifier'],
        check: 'checkLangCode',
        message: 'is not a valid 2-symbol [a-z] code'
    },
    OPENAI_API_ENDPOINT: {
        required_by: ['function:3-translator', 'function:4-checker'],
        check: 'checkStartsWithHttp',
        message: "does not start with 'http'"
    },
    OPENAI_API_KEY: {
        required_by: ['function:3-translator', 'function:4-checker']
    },
    OPENAI_MODEL: {
        required_by: ['function:3-translator', 'function:4-checker']
    },
    OPENAI_TEMPERATURE: {
        required_by: ['function:3-translator', 'function:4-checker']
    },
    LANG_FROM: {
        required_by: ['function:3-translator']
    },
    LANG_TO: {
        required_by: ['function:3-translator', 'function:4-checker']
    },
    EXAMPLE_HI: {
        required_by: ['function:3-translator']
    },
    EXAMPLE_HOWRU: {
        required_by: ['function:3-translator']
    },
    SV_SPREADSHEET_ID: {
        required_by: ['tool:svscript-convert']
    }
};

// Check functions
const checks = {
    fileExistsAndNotEmpty: (filePath) => {
        try {
            return fs.statSync(filePath).size > 0;
        } catch {
            return false;
        }
    },

    dirExistsAndNotEmpty: (dirPath) => {
        try {
            return fs.readdirSync(dirPath).length > 0;
        } catch {
            return false;
        }
    },

    validDirOrCreatable: (dirPath) => {
        if (fs.existsSync(dirPath)) return true;
        try {
            fs.mkdirSync(dirPath, { recursive: true });
            fs.rmdirSync(dirPath);
            return true;
        } catch {
            return false;
        }
    },

    checkLangCode: (code) => {
        return /^[a-z]{2}$/.test(code);
    },

    checkStartsWithHttp: (url) => {
        return url.toLowerCase().startsWith('http');
    },

    equalsTrueOrFalse: (value) => {
        return ['true', 'false'].includes(value.toLowerCase());
    }
};

// Main check function
async function checkEnvironment(requiredFor = null) {
    let errors = 0;
    console.log('## Variable Checks ##');

    // Function to check a single variable
    const checkVariable = (varName, config) => {
        const value = process.env[varName];
        const errorMessage = config.message || (config.check ? 'failed validation check.' : 'is not set or is empty.');

        if (!value) {
            console.log(chalk.yellow('[WARNING]'), `${varName} ${errorMessage}`);
            return false;
        }

        if (config.check && !checks[config.check](value)) {
            console.log(chalk.yellow('[WARNING]'), `${varName} ${errorMessage}`);
            return false;
        }

        console.log(chalk.green('[OK]'), `${varName} is set and valid.`);
        return true;
    };

    if (requiredFor) {
        // Check only variables required for specific function/tool
        for (const [varName, config] of Object.entries(variables)) {
            if (config.required_by && config.required_by.includes(requiredFor)) {
                if (!checkVariable(varName, config)) {
                    errors++;
                }
            }
        }

        if (errors > 0) {
            console.log(chalk.red('\nRequired variables are missing or invalid.'));
            process.exit(1);
        }
    } else {
        // Check all variables
        for (const [varName, config] of Object.entries(variables)) {
            checkVariable(varName, config);
        }

        console.log('\n## Final Status ##');
        console.log(chalk.green('Check completed. Any warnings above should be reviewed.'));
    }
    console.log();
}

async function cleanup(all = false) {
    console.log(chalk.blue('Starting cleanup...'));

    // Remove RES_DIR, TEXTURES_DIR, OUT_DIR and Logs
    for (const dir of [process.env.RES_DIR, process.env.TEXTURES_DIR, process.env.OUT_DIR, path.join(__dirname, 'Logs')]) {
        if (dir && fs.existsSync(dir)) {
            console.log(`Removing directory: ${dir}`);
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }

    if (all) {
        // Process numbered folders under Functions directory
        const functionsDir = path.join(process.cwd(), 'Functions');
        if (fs.existsSync(functionsDir)) {
            console.log('Processing Functions directory...');
            const entries = fs.readdirSync(functionsDir);

            for (const entry of entries) {
                const fullPath = path.join(functionsDir, entry);
                if (fs.statSync(fullPath).isDirectory() && /^\d+-/.test(entry)) {
                    console.log(`Processing Function directory: ${entry}`);

                    // Clean up specific paths in each numbered directory
                    const pathsToRemove = [
                        path.join(fullPath, '.venv'),
                        path.join(fullPath, 'node_modules'),
                        path.join(fullPath, 'package-lock.json')
                    ];

                    for (const pathToRemove of pathsToRemove) {
                        if (fs.existsSync(pathToRemove)) {
                            console.log(`Removing: ${pathToRemove}`);
                            fs.rmSync(pathToRemove, { recursive: true, force: true });
                        }
                    }
                }
            }
        }

        // Handle tools under Misc directory
        const miscDir = path.join(process.cwd(), 'Misc');
        if (fs.existsSync(miscDir)) {
            console.log('Processing Misc directory...');
            const toolEntries = fs.readdirSync(miscDir);

            for (const entry of toolEntries) {
                const fullPath = path.join(miscDir, entry);
                if (fs.statSync(fullPath).isDirectory()) {
                    const pathsToRemove = [
                        path.join(fullPath, '.venv'),
                        path.join(fullPath, 'node_modules'),
                        path.join(fullPath, 'package-lock.json')
                    ];

                    for (const pathToRemove of pathsToRemove) {
                        if (fs.existsSync(pathToRemove)) {
                            console.log(`Removing: ${pathToRemove}`);
                            fs.rmSync(pathToRemove, { recursive: true, force: true });
                        }
                    }
                }
            }
        }
    }

    // Clean up data directory
    const dataDir = path.join(process.cwd(), 'Data');
    if (fs.existsSync(dataDir)) {
        console.log('Cleaning up data directory...');
        const dataFiles = fs.readdirSync(dataDir);
        for (const file of dataFiles) {
            if (file.startsWith('parsed-') && file.endsWith('.json')) {
                const filePath = path.join(dataDir, file);
                console.log(`Removing: ${filePath}`);
                fs.unlinkSync(filePath);
            }
        }
    }

    console.log(chalk.green('Cleanup completed successfully!'));
}

function createVirtualEnv(dir) {
    const venvPath = path.join(dir, '.venv');
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

    console.log(chalk.blue(`Creating virtual environment in ${dir}...`));
    execSync(`${pythonCommand} -m venv .venv`, { cwd: dir, stdio: 'inherit' });

    // Install requirements
    const pipCommand = process.platform === 'win32'
        ? '.venv\\Scripts\\pip'
        : '.venv/bin/pip';

    console.log(chalk.blue('Installing Python dependencies...'));
    execSync(`"${pipCommand}" install -r requirements.txt`, { cwd: dir, stdio: 'inherit' });
}

function installNpmDependencies(dir) {
    console.log(chalk.blue(`Installing npm dependencies in ${dir}...`));
    execSync('npm install', { cwd: dir, stdio: 'inherit' });
}

async function installDependencies(dir) {
    console.log(chalk.blue(`Processing directory: ${dir}`));

    const hasPackageJson = fs.existsSync(path.join(dir, 'package.json'));
    const hasRequirements = fs.existsSync(path.join(dir, 'requirements.txt'));

    if (hasPackageJson) {
        installNpmDependencies(dir);
    }

    if (hasRequirements) {
        createVirtualEnv(dir);
    }

    if (!hasPackageJson && !hasRequirements) {
        console.log(chalk.yellow(`No dependencies found in ${dir}`));
    }
}

function getFunctionDirs() {
    const functionsDir = path.join(process.cwd(), 'Functions');
    if (!fs.existsSync(functionsDir)) return [];

    return fs.readdirSync(functionsDir)
        .filter(entry => {
            const fullPath = path.join(functionsDir, entry);
            return fs.statSync(fullPath).isDirectory() && /^\d+-/.test(entry);
        })
        .map(dir => path.join(functionsDir, dir));
}

function getToolDirs() {
    const miscDir = path.join(process.cwd(), 'Misc');
    if (!fs.existsSync(miscDir)) return [];

    return fs.readdirSync(miscDir)
        .filter(entry => {
            const fullPath = path.join(miscDir, entry);
            return fs.statSync(fullPath).isDirectory();
        })
        .map(dir => path.join(miscDir, dir));
}

function run(dir, extraArgs = []) {
    console.log(chalk.blue(`Running ${dir}`));

    const dirType = dir.includes('Functions') ? 'function' : 'tool';
    const dirName = path.basename(dir);
    const requiredFor = `${dirType}:${dirName}`;

    checkEnvironment(requiredFor);

    const hasPackageJson = fs.existsSync(path.join(dir, 'package.json'));
    const hasRequirements = fs.existsSync(path.join(dir, 'requirements.txt'));

    if (hasPackageJson) {
        const indexPath = path.join(dir, 'index.js');
        if (fs.existsSync(indexPath)) {
            console.log(chalk.blue(`Running Node.js: ${indexPath}`));
            try {
                // Join the extra arguments and escape them properly
                const argsString = extraArgs.map(arg => `"${arg}"`).join(' ');
                execSync(`node "${indexPath}" ${argsString}`, { stdio: 'inherit' });
            } catch {
                console.log(chalk.red('Finished with an error.'));
                process.exit(1);
            }
        } else {
            console.log(chalk.yellow(`index.js not found in ${dir}`));
        }
    }

    if (hasRequirements) {
        const mainPath = path.join(dir, 'main.py');
        if (fs.existsSync(mainPath)) {
            console.log(chalk.blue(`Running Python: ${mainPath}`));

            if (process.platform === 'win32') {
                const batchContent = `
                    @echo off
                    call ".venv\\Scripts\\activate.bat"
                    python main.py
                    deactivate
                `.trim();

                const batchPath = path.join(dir, 'temp-run.bat');
                fs.writeFileSync(batchPath, batchContent);

                try {
                    execSync(`"${batchPath}"`, {
                        cwd: dir,
                        stdio: 'inherit',
                        shell: true
                    });
                } catch {
                    fs.unlinkSync(batchPath);
                    console.log(chalk.red('Finished with an error.'));
                    process.exit(1);
                }
                fs.unlinkSync(batchPath);
            } else {
                try {
                    execSync(`source .venv/bin/activate && python main.py`, {
                        cwd: dir,
                        stdio: 'inherit',
                        shell: true
                    });
                } catch {
                    console.log(chalk.red('Script returned an error.'));
                    process.exit(1);
                }
            }
        } else {
            console.log(chalk.yellow(`main.py not found in ${dir}`));
        }
    }

    if (!hasPackageJson && !hasRequirements) {
        console.log(chalk.yellow(`No runnable scripts found in ${dir}`));
    }
}

async function main() {
    const [command, subCommand] = (process.argv[2] || '').split(':');
    const args = process.argv.slice(3);

    switch (command) {
        case 'clean':
            if (subCommand === 'all') {
                await cleanup(true);
            } else {
                await cleanup();
            }
            break;

        case 'validate':
            const parentDirs = ['Functions', 'Misc'];
            console.log('## Dependency Checks ##');
            for (const parentDir of parentDirs) {
                const parentPath = path.join(process.cwd(), parentDir);
                if (fs.existsSync(parentPath)) {
                    const subDirs = fs.readdirSync(parentPath).filter(dir => fs.statSync(path.join(parentPath, dir)).isDirectory());
                    for (const dir of subDirs) {
                        const dirPath = path.join(parentPath, dir);
                        const venvPath = path.join(dirPath, '.venv');
                        const nodeModulesPath = path.join(dirPath, 'node_modules');

                        if (!fs.existsSync(venvPath) && !fs.existsSync(nodeModulesPath)) {
                            console.log(chalk.red('[CRITICAL]'), dir, 'Dependencies not found, please run', chalk.blue('npm run init'), 'first.');
                            process.exit(1);
                        } else {
                            console.log(chalk.green('[OK]'), dir);
                        }
                    }
                }
            }
            console.log();
            await checkEnvironment();
            break;

        case 'install':
            switch (subCommand) {
                case 'all':
                    const allDirs = [...getFunctionDirs(), ...getToolDirs()];
                    for (const dir of allDirs) {
                        await installDependencies(dir);
                    }
                    break;

                case 'function':
                    const functionDirs = getFunctionDirs();
                    const targetFunctionDir = functionDirs.find(dir => path.basename(dir).includes(args[0]));
                    if (!targetFunctionDir) {
                        console.error(chalk.red(`Function "${args[0]}" not found`));
                        process.exit(1);
                    }
                    await installDependencies(targetFunctionDir);
                    break;

                case 'tool':
                    const toolDirs = getToolDirs();
                    const targetToolDir = toolDirs.find(dir => path.basename(dir) === args[0]);
                    if (!targetToolDir) {
                        console.error(chalk.red(`Tool "${args[0]}" not found`));
                        process.exit(1);
                    }
                    await installDependencies(targetToolDir);
                    break;

                default:
                    console.error(chalk.red('Invalid install command. Use install:all, install:function, or install:tool'));
                    process.exit(1);
            }
            break;

        case 'run':
            switch (subCommand) {
                case 'function':
                    const functionDirs = getFunctionDirs();
                    // Get the function names (first argument, split by comma)
                    const functionNames = args[0].split(',');
                    // Get the rest of the arguments to pass to the scripts
                    const functionExtraArgs = args.slice(1);

                    for (const functionName of functionNames) {
                        const targetFunctionDir = functionDirs.find(dir => path.basename(dir).includes(functionName));
                        if (!targetFunctionDir) {
                            console.error(chalk.red(`Function "${functionName}" not found`));
                            process.exit(1);
                        }
                        console.log(chalk.blue(`\nProcessing function: ${functionName}`));
                        await run(targetFunctionDir, functionExtraArgs);
                    }
                    break;

                case 'tool':
                    const toolDirs = getToolDirs();
                    // Get the tool names (first argument, split by comma)
                    const toolNames = args[0].split(',');
                    // Get the rest of the arguments to pass to the scripts
                    const toolExtraArgs = args.slice(1);

                    for (const toolName of toolNames) {
                        const targetToolDir = toolDirs.find(dir => path.basename(dir) === toolName);
                        if (!targetToolDir) {
                            console.error(chalk.red(`Tool "${toolName}" not found`));
                            process.exit(1);
                        }
                        console.log(chalk.blue(`\nProcessing tool: ${toolName}`));
                        await run(targetToolDir, toolExtraArgs);
                    }
                    break;

                default:
                    console.error(chalk.red('Invalid run command. Use run:function or run:tool'));
                    process.exit(1);
            }
            break;

        default:
            console.error(chalk.red('Command not understood. Available commands: clean, validate, install:[all|function|tool], run:[function|tool]'));
            process.exit(1);
    }
}

// Run the script
main().catch(error => {
    console.log(chalk.red('An unexpected error occurred:'), error);
    process.exit(1);
});