import os
import sys
import shutil
import subprocess
import traceback
from datetime import datetime
from tqdm import tqdm
from dotenv import load_dotenv

# For debugging/development purposes
IMPORT_MAIN      = True
IMPORT_STRINGS   = True
IMPORT_DIALOGUES = True
IMPORT_TEXTURES  = True

log_path = os.path.join(os.path.dirname(__file__), '../', '../', 'Logs', '6-boom-boom-build.log')
os.makedirs(os.path.dirname(log_path), exist_ok=True)
open(log_path, 'w').close()

def log(message):
    with open(log_path, 'a', encoding='utf-8') as log_file:
        timestamp = datetime.now().strftime('[%Y-%m-%d %H:%M:%S]')
        log_file.write(f"{timestamp} {message}\n")

log("==== FUNCTION STARTED ====")

load_dotenv('../../.env')

if os.getenv('SKIP_TEXTURES', '').lower() == 'true':
    IMPORT_TEXTURES = False
    log("SKIP_TEXTURES is enabled - texture import disabled")

# Suppress UnityVersionFallbackWarning since we're explicitly setting the fallback version
import warnings
import UnityPy
warnings.filterwarnings("ignore", category=UnityPy.config.UnityVersionFallbackWarning)

if os.getenv('UNITYPY_USE_PYTHON_PARSER') == 'true':
    from UnityPy.helpers import TypeTreeHelper
    TypeTreeHelper.read_typetree_boost = False
    log("Using Python parser for TypeTree")

# Handle both relative and absolute paths
def get_path(env_var):
    path = os.getenv(env_var)
    if path is None:
        log(f"Warning: Environment variable {env_var} is not set")
        return ''
    if os.path.isabs(path):
        return path
    return os.path.join('../', '../', path)

data_dir      = get_path('GAME_DATA_DIR')
res_dir       = get_path('RES_DIR')
overrides_dir = get_path('OVERRIDES_DIR')
out_dir       = get_path('OUT_DIR')

log(f"Environment configuration:")
log(f"  GAME_DATA_DIR: {data_dir}")
log(f"  RES_DIR: {res_dir}")
log(f"  OVERRIDES_DIR: {overrides_dir}")
log(f"  OUT_DIR: {out_dir}")
log(f"  UNITYPY_USE_PYTHON_PARSER: {os.getenv('UNITYPY_USE_PYTHON_PARSER')}")
log(f"  CREATE_PATCHER: {os.getenv('CREATE_PATCHER')}")

typetree_path      = os.path.join(os.path.dirname(__file__), '../', '../', 'Data', 'I2.loc.typetree.json')
textures_list_path = os.path.join(os.path.dirname(__file__), '../', '../', 'Data', 'textures.list')

# ===========================================================================
# CREATE_PATCHER mode - build a standalone patcher executable
# ===========================================================================

if os.getenv('CREATE_PATCHER', '').lower() == 'true':
    log("CREATE_PATCHER is enabled - building patcher executable")
    print("Building patcher executable...")

    script_dir = os.path.dirname(os.path.abspath(__file__))
    venv_python = (
        os.path.join(script_dir, '.venv', 'Scripts', 'python.exe')
        if os.name == 'nt'
        else os.path.join(script_dir, '.venv', 'bin', 'python')
    )

    # Resolve absolute out_dir for the build
    abs_out_dir = os.path.abspath(out_dir) if out_dir else os.path.join(script_dir, '..', '..', '!distr')

    # Clean the output directory first to avoid stale artefacts
    if os.path.exists(abs_out_dir):
        log(f"Cleaning output directory: {abs_out_dir}")
        print(f"Cleaning output directory...")
        shutil.rmtree(abs_out_dir)
    os.makedirs(abs_out_dir, exist_ok=True)

    # PyInstaller separator is ';' on Windows, ':' on Unix
    sep = ';' if os.name == 'nt' else ':'

    # Prepare the data directory that will sit next to the executable
    patcher_data_dir = os.path.join(abs_out_dir, 'data')
    os.makedirs(patcher_data_dir, exist_ok=True)

    # Copy static data files
    shutil.copy2(typetree_path, os.path.join(patcher_data_dir, 'I2.loc.typetree.json'))
    shutil.copy2(textures_list_path, os.path.join(patcher_data_dir, 'textures.list'))
    log(f"Copied data files to {patcher_data_dir}")

    # Copy only *-mod.json files from res_dir (preserving subdirectory structure)
    patcher_res_dir = os.path.join(abs_out_dir, 'resources')
    if os.path.isdir(res_dir):
        copied_res = 0
        for dirpath, dirnames, filenames in os.walk(res_dir):
            for filename in filenames:
                if filename.endswith('-mod.json'):
                    src = os.path.join(dirpath, filename)
                    rel = os.path.relpath(dirpath, res_dir)
                    dst_dir = os.path.join(patcher_res_dir, rel)
                    os.makedirs(dst_dir, exist_ok=True)
                    shutil.copy2(src, os.path.join(dst_dir, filename))
                    copied_res += 1
        log(f"Copied {copied_res} *-mod.json files from {res_dir} to {patcher_res_dir}")
        print(f"Copied {copied_res} resource files to: {patcher_res_dir}")
    else:
        log(f"Warning: RES_DIR '{res_dir}' does not exist, skipping resource copy")
        print(f"Warning: RES_DIR '{res_dir}' does not exist, skipping resource copy")

    # Copy only PNG files from overrides dir
    if overrides_dir and os.path.isdir(overrides_dir):
        patcher_overrides_dir = os.path.join(abs_out_dir, 'overrides')
        os.makedirs(patcher_overrides_dir, exist_ok=True)
        copied_overrides = 0
        for filename in os.listdir(overrides_dir):
            if filename.lower().endswith('.png'):
                src = os.path.join(overrides_dir, filename)
                if os.path.isfile(src):
                    shutil.copy2(src, os.path.join(patcher_overrides_dir, filename))
                    copied_overrides += 1
        log(f"Copied {copied_overrides} PNG overrides from {overrides_dir} to {patcher_overrides_dir}")
        print(f"Copied {copied_overrides} texture overrides to: {patcher_overrides_dir}")

    # PyInstaller can only build for the current platform.
    # The executable is placed directly in abs_out_dir alongside data/, resources/, overrides/.
    wrapper_path = os.path.join(script_dir, 'wrapper.py')
    patcher_path = os.path.join(script_dir, 'patcher.py')

    print("Building patcher executable...")
    log("Building patcher executable")

    # Collect UnityPy and all its dependencies that contain native binaries or data files
    collect_packages = [
        'UnityPy',
        'fmod_toolkit',   # audio: libfmod native dylib/dll
        'pyfmodex',       # audio: fmod Python bindings
        'astc_encoder',   # texture: ASTC encoder
        'archspec',       # dep of astc_encoder: CPU microarch JSON data
        'etcpak',         # texture: ETC compression
        'texture2ddecoder',  # texture: decoder
        'brotli',         # compression
    ]
    collect_args = []
    for pkg in collect_packages:
        collect_args += ['--collect-all', pkg]

    cmd = [
        venv_python, '-m', 'PyInstaller',
        '--onefile',
        '--name', 'patcher',
        '--distpath', abs_out_dir,
        '--workpath', os.path.join(script_dir, '.pyinstaller-build'),
        '--specpath', os.path.join(script_dir, '.pyinstaller-build'),
        '--add-data', f'{patcher_path}{sep}.',
    ] + collect_args + [wrapper_path]

    log(f"PyInstaller command: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=script_dir)
        if result.returncode != 0:
            log(f"PyInstaller stderr:\n{result.stderr}")
            log(f"PyInstaller stdout:\n{result.stdout}")
            print("Error building patcher. Check the log for details.")
            sys.exit(1)
        log(f"Successfully built patcher: {abs_out_dir}")
        print(f"  -> {abs_out_dir}")
    except Exception as e:
        log(f"Exception during build: {str(e)}")
        log(traceback.format_exc())
        print(f"Error: {e}")
        sys.exit(1)

    # Clean up PyInstaller build artifacts
    build_dir = os.path.join(script_dir, '.pyinstaller-build')
    if os.path.exists(build_dir):
        shutil.rmtree(build_dir)

    print("\nPatcher build complete.")
    print(f"Output directory: {abs_out_dir}")
    log("Patcher build complete")
    sys.exit(0)


# ===========================================================================
# Normal mode - patch game resources directly
# ===========================================================================

from patcher import ResourcePatcher

strings_num   = 0
textures_num  = 0
dialogues_num = 0
bundles_num   = 0

# tqdm progress -> drive tqdm bars
def make_progress_callback():
    """Returns an on_progress callback that drives tqdm bars."""
    bars = {}

    def on_progress(stage, current, total):
        if total == 0:
            return
        # i2languages is a single-item operation - just print status
        if stage == 'i2languages':
            if current == 0:
                print('Importing I2Languages: ', end='', flush=True)
            elif current >= total:
                print('1/1')
            return
        stage_labels = {
            'strings':   'Importing strings:',
            'dialogues': 'Importing dialogues:',
            'textures':  'Importing textures:',
        }
        if stage not in bars and stage in stage_labels:
            bar_format = "{desc:<21}{percentage:3.0f}%|{bar}{r_bar}"
            bars[stage] = tqdm(
                total=total,
                desc=stage_labels[stage],
                bar_format=bar_format,
                ascii=(os.name == 'nt'),
            )
        if stage in bars:
            bars[stage].n = current
            bars[stage].refresh()
            if current >= total:
                bars[stage].close()
                del bars[stage]

    return on_progress

on_progress = make_progress_callback()

# Validate required flags
if not IMPORT_MAIN:
    log("IMPORT_MAIN is disabled")
if not IMPORT_STRINGS:
    log("IMPORT_STRINGS is disabled")
if not IMPORT_DIALOGUES:
    log("IMPORT_DIALOGUES is disabled")
if not IMPORT_TEXTURES:
    log("IMPORT_TEXTURES is disabled")

# Clean the output directory before writing
abs_out_dir = os.path.abspath(out_dir) if out_dir else ''
if abs_out_dir and os.path.exists(abs_out_dir):
    log(f"Cleaning output directory: {abs_out_dir}")
    print("Cleaning output directory...")
    shutil.rmtree(abs_out_dir)
os.makedirs(abs_out_dir, exist_ok=True)

try:
    patcher = ResourcePatcher(
        game_data_dir=data_dir,
        res_dir=res_dir,
        out_dir=out_dir,
        overrides_dir=overrides_dir if IMPORT_TEXTURES else None,
        skip_textures=not IMPORT_TEXTURES,
        use_python_parser=(os.getenv('UNITYPY_USE_PYTHON_PARSER') == 'true'),
        typetree_path=typetree_path,
        textures_list_path=textures_list_path,
        log_fn=log,
        on_progress=on_progress,
    )

    # Honour the IMPORT_* debug flags by monkey-patching the patcher
    if not IMPORT_MAIN:
        patcher._import_i2languages = lambda: None
    if not IMPORT_STRINGS:
        patcher._import_strings = lambda: None
    if not IMPORT_DIALOGUES:
        patcher._import_dialogues = lambda: None
    if not IMPORT_TEXTURES:
        patcher._import_textures = lambda: None

    summary = patcher.run()
    strings_num   = summary['strings']
    textures_num  = summary['textures']
    dialogues_num = summary['dialogues']
    bundles_num   = summary['bundles']

except FileNotFoundError as e:
    print(str(e))
    log(str(e))
    sys.exit(1)
except RuntimeError as e:
    print(str(e))
    log(str(e))
    sys.exit(1)
except Exception as e:
    log(f"Unexpected error: {str(e)}")
    log(traceback.format_exc())
    print(f"Unexpected error: {str(e)}")
    sys.exit(1)

post_cmd = os.getenv('POST_CMD')
if post_cmd:
    work_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    os.chdir(work_dir)
    print('Running post-processing...')
    if os.name == 'nt':
        result = subprocess.run(post_cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    else:
        result = subprocess.run(post_cmd, shell=True, executable='/bin/sh', stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if result.stderr:
        log(result.stderr)

summary_text = f"""
[SUMMARY]
Imported I2Languages: 1
Imported strings: {strings_num}
Imported textures: {textures_num}
Imported dialogue databases: {dialogues_num}
Bundles created: {bundles_num}
"""
print()
print(summary_text.strip())
log(summary_text)
