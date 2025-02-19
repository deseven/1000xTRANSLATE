import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { execSync } from 'child_process';

// Load environment variables
try {
    dotenv.config();
} catch (error) {
    console.error(chalk.red('[CRITICAL]'), '.env file does not exist or cannot be loaded.');
    process.exit(1);
}

// Variables to check (name:severity:function:error)
const variables = [
    ["SPREADSHEET_ID", "CRITICAL", null, null],
    ["GOOGLE_CREDENTIALS_FILE", "CRITICAL", "fileExistsAndNotEmpty", "file does not exist or is empty"],
    ["VOCAB_CHARS_SHEET_NAME", "CRITICAL", null, null],
    ["VOCAB_TERMS_SHEET_NAME", "CRITICAL", null, null],
    ["SYSTEM_SHEET_NAME", "CRITICAL", null, null],
    ["ACTORS_SHEET_NAME", "CRITICAL", null, null],
    ["QUESTS_SHEET_NAME", "CRITICAL", null, null],
    ["DIALOGUES_SHEET_NAME", "CRITICAL", null, null],
    ["GAME_DATA_DIR", "CRITICAL", "dirExistsAndNotEmpty", "directory does not exist or is empty"],
    ["GAME_UNITY_VERSION", "CRITICAL", null, null],
    ["UNITYPY_USE_PYTHON_PARSER", "WARNING", "equalsTrueOrFalse", "does not equal to 'true' or 'false'"],
    ["RES_DIR", "CRITICAL", "validDirOrCreatable", "is not a valid directory or cannot be created"],
    ["OUT_DIR", "CRITICAL", "validDirOrCreatable", "is not a valid directory or cannot be created"],
    ["BASE_LANG", "CRITICAL", "checkLangCode", "is not a valid 2-symbol [a-z] code"],
    ["TARGET_LANG", "CRITICAL", "checkLangCode", "is not a valid 2-symbol [a-z] code"],
    ["OPENAI_API_ENDPOINT", "WARNING", "checkStartsWithHttp", "does not start with 'http'"],
    ["OPENAI_API_KEY", "WARNING", null, null],
    ["OPENAI_MODEL", "WARNING", null, null]
];

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
async function checkEnvironment() {
    let criticalErrors = 0;
    let warningErrors = 0;

    console.log('## Variable Checks ##');

    for (const [varName, severity, checkFunc, message] of variables) {
        const value = process.env[varName];
        const defaultMessage = checkFunc ? 'failed validation check.' : 'is not set or is empty.';
        const errorMessage = message || defaultMessage;

        if (!value) {
            if (severity === 'CRITICAL') {
                console.log(chalk.red('[CRITICAL]'), `${varName} ${errorMessage}`);
                criticalErrors++;
            } else {
                console.log(chalk.yellow('[WARNING]'), `${varName} ${errorMessage}`);
                warningErrors++;
            }
            continue;
        }

        if (checkFunc) {
            if (!checks[checkFunc](value)) {
                if (severity === 'CRITICAL') {
                    console.log(chalk.red('[CRITICAL]'), `${varName} ${errorMessage}`);
                    criticalErrors++;
                } else {
                    console.log(chalk.yellow('[WARNING]'), `${varName} ${errorMessage}`);
                    warningErrors++;
                }
            } else {
                console.log(chalk.green('[OK]'), `${varName} is set and valid.`);
            }
        } else {
            console.log(chalk.green('[OK]'), `${varName} is set.`);
        }
    }

    console.log('\n## Final Status ##');

    if (criticalErrors > 0) {
        console.log(chalk.red('There are critical errors, please fix them first.'));
        process.exit(1);
    } else if (warningErrors > 0) {
        console.log(chalk.yellow('Encountered several non-critical errors.'));
    } else {
        console.log(chalk.green('All seems to be in order :)'));
    }
    console.log();
}

async function cleanup(all = false) {
    console.log(chalk.blue('Starting cleanup...'));

    // Remove RES_DIR and OUT_DIR
    for (const dir of [process.env.RES_DIR, process.env.OUT_DIR]) {
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
    const dataDir = path.join(process.cwd(), 'data');
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

function run(dir) {
    console.log(chalk.blue(`Running ${dir}`));

    const hasPackageJson = fs.existsSync(path.join(dir, 'package.json'));
    const hasRequirements = fs.existsSync(path.join(dir, 'requirements.txt'));

    if (hasPackageJson) {
        const indexPath = path.join(dir, 'index.js');
        if (fs.existsSync(indexPath)) {
            console.log(chalk.blue(`Running Node.js: ${indexPath}`));
            try {
                execSync(`node "${indexPath}"`, { stdio: 'inherit' });
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

        case 'check':
            if (args.length > 0) {
                for (const dir of args) {
                    console.log(chalk.blue(`\nChecking directory: ${dir}`));
                    const venvPath = path.join(dir, '.venv');
                    const nodeModulesPath = path.join(dir, 'node_modules');

                    if (!fs.existsSync(venvPath) && !fs.existsSync(nodeModulesPath)) {
                        console.log(chalk.red('[CRITICAL]'), 'Dependencies not found, please run appropriate install command first.');
                        process.exit(1);
                    }
                }
            }
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
                    for (const arg of args) {
                        const targetFunctionDir = functionDirs.find(dir => path.basename(dir).includes(arg));
                        if (!targetFunctionDir) {
                            console.error(chalk.red(`Function "${arg}" not found`));
                            process.exit(1);
                        }
                        console.log(chalk.blue(`\nProcessing function: ${arg}`));
                        await checkEnvironment();
                        await run(targetFunctionDir);
                    }
                    break;

                case 'tool':
                    const toolDirs = getToolDirs();
                    for (const arg of args) {
                        const targetToolDir = toolDirs.find(dir => path.basename(dir) === arg);
                        if (!targetToolDir) {
                            console.error(chalk.red(`Tool "${arg}" not found`));
                            process.exit(1);
                        }
                        console.log(chalk.blue(`\nProcessing tool: ${arg}`));
                        await checkEnvironment();
                        await run(targetToolDir);
                    }
                    break;

                default:
                    console.error(chalk.red('Invalid run command. Use run:function or run:tool'));
                    process.exit(1);
            }
            break;

        default:
            console.error(chalk.red('Command not understood. Available commands: clean, check, install:[all|function|tool], run:[function|tool]'));
            process.exit(1);
    }
}

// Run the script
main().catch(error => {
    console.log(chalk.red('An unexpected error occurred:'), error);
    process.exit(1);
});