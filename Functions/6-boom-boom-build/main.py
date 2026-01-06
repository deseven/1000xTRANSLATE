import os
import json
import UnityPy
from PIL import Image
from dotenv import load_dotenv
from tqdm import tqdm
import traceback
from datetime import datetime

# For debugging/development purposes
IMPORT_MAIN = True
IMPORT_STRINGS = True
IMPORT_DIALOGUES = True
IMPORT_TEXTURES = True

log_path = os.path.join(os.path.dirname(__file__), '../', '../', 'Logs', '6-boom-boom-build.log')
os.makedirs(os.path.dirname(log_path), exist_ok=True)
open(log_path, 'w').close()

def log(message):
    with open(log_path, 'a', encoding='utf-8') as log_file:
        timestamp = datetime.now().strftime('[%Y-%m-%d %H:%M:%S]')
        log_file.write(f"{timestamp} {message}\n")

def tqdm_wrap(iterable, desc):
    bar_format = "{desc:<21}{percentage:3.0f}%|{bar}{r_bar}"
    if os.name == 'nt':  # Windows
        return tqdm(iterable=iterable, desc=desc, bar_format=bar_format, ascii=False)
    else:
        return tqdm(iterable=iterable, desc=desc, bar_format=bar_format)

log("==== FUNCTION STARTED ====")

load_dotenv('../../.env')
UnityPy.config.FALLBACK_UNITY_VERSION = os.getenv('GAME_UNITY_VERSION')

# Suppress UnityVersionFallbackWarning since we're explicitly setting the fallback version
import warnings
warnings.filterwarnings("ignore", category=UnityPy.config.UnityVersionFallbackWarning)

# Handle both relative and absolute paths
def get_path(env_var):
    path = os.getenv(env_var)
    if path is None:
        log(f"Warning: Environment variable {env_var} is not set")
        return ''
    if os.path.isabs(path):
        return path
    return os.path.join('../', '../', path)

data_dir = get_path('GAME_DATA_DIR')
res_dir = get_path('RES_DIR')
overrides_dir = get_path('OVERRIDES_DIR')
out_dir = os.path.join(get_path('OUT_DIR'), '1000xRESIST_Data')

log(f"Environment configuration:")
log(f"  GAME_UNITY_VERSION: {os.getenv('GAME_UNITY_VERSION')}")
log(f"  GAME_DATA_DIR: {data_dir}")
log(f"  RES_DIR: {res_dir}")
log(f"  OVERRIDES_DIR: {overrides_dir}")
log(f"  OUT_DIR: {out_dir}")
log(f"  UNITYPY_USE_PYTHON_PARSER: {os.getenv('UNITYPY_USE_PYTHON_PARSER')}")

strings_num = 0
textures_num = 0
dialogues_num = 0
bundles_num = 0

if os.getenv('UNITYPY_USE_PYTHON_PARSER') == 'true':
    from UnityPy.helpers import TypeTreeHelper
    TypeTreeHelper.read_typetree_boost = False
    log("Using Python parser for TypeTree")

streaming_assets_path = os.path.join('StreamingAssets', 'aa', 'StandaloneWindows64')
bundle_dir = os.path.join(data_dir, streaming_assets_path)
dialogue_bundles = [f for f in os.listdir(bundle_dir) if f.endswith('.bundle') and '_other_' in f]
texture_bundles = [f for f in os.listdir(bundle_dir) if f.endswith('.bundle') and '_texture_' in f]
scene_bundles = [f for f in os.listdir(bundle_dir) if f.endswith('.bundle') and '_scenes_' in f]

log(f"Found bundles: {len(dialogue_bundles)} dialogue, {len(texture_bundles)} texture, {len(scene_bundles)} scene")

typetree_path = os.path.join('../','../', 'Data', 'I2.loc.typetree.json')
log(f"Reading file: {typetree_path}")
with open(typetree_path, 'r', encoding='utf-8') as f:
    I2LocTypetree = json.load(f)

i2languages_path = os.path.join(res_dir, 'I2Languages-mod.json')
if not os.path.exists(i2languages_path) or os.path.getsize(i2languages_path) == 0:
    error_msg = "Error: I2Languages-mod.json is missing or empty. Run Desheetifier first?"
    log(error_msg)
    print(error_msg)
    exit(1)

strings_path = os.path.join(res_dir, 'strings-mod.json')
if not os.path.exists(strings_path) or os.path.getsize(strings_path) == 0:
    error_msg = "Error: strings-mod.json is missing or empty. Run Desheetifier first?"
    log(error_msg)
    print(error_msg)
    exit(1)

log(f"Reading file: {i2languages_path}")
with open(i2languages_path, 'r', encoding='utf-8') as f:
    I2Languages = json.load(f)

log(f"Reading file: {strings_path}")
with open(strings_path, 'r', encoding='utf-8') as f:
    strings = json.load(f)

textures_list_path = os.path.join(os.path.dirname(__file__), '../', '../', 'Data/textures.list')
log(f"Reading file: {textures_list_path}")
with open(textures_list_path, 'r', encoding='utf-8') as f:
    textures = [line.strip() for line in f.readlines()]

if IMPORT_MAIN:
    print('Importing I2Languages: ',end='')
    file_path = os.path.join(data_dir, 'resources.assets')
    log(f"Reading file: {file_path}")
    try:
        env = UnityPy.load(file_path)
        found = False
        for obj in env.objects:
            if obj.type.name == 'MonoBehaviour':
                try:
                    data = obj.read(check_read=False)
                    if getattr(data, 'm_Name') == "I2Languages":
                        found = True
                except:
                    continue
                if found:
                    obj.save_typetree(I2Languages, I2LocTypetree['I2.Loc.LanguageSourceAsset'])
                    os.makedirs(out_dir, exist_ok=True)
                    out_path = os.path.join(out_dir, 'resources.assets')
                    log(f"Writing file: {out_path}")
                    with open(out_path, "wb") as f:
                        f.write(env.file.save(packer="original"))
                    print('1/1')
                    log("I2Languages successfully imported")
                    break

        if not found:
            error_msg = "Failed to import I2Languages: I2Languages not found in resources.assets"
            print('failed')
            log(error_msg)
            exit(1)
    except Exception as e:
        error_msg = f"Error importing I2Languages: {str(e)}"
        log(error_msg)
        log(traceback.format_exc())
        print('failed')
        exit(1)

if IMPORT_STRINGS:
    for bundle_name in tqdm_wrap(iterable=scene_bundles, desc='Importing strings:'):
        needs_saving = False
        file_path = os.path.join(bundle_dir, bundle_name)
        log(f"Reading file: {file_path}")
        try:
            env = UnityPy.load(file_path)
            bundle_strings_count = 0
            
            for obj in env.objects:
                if obj.type.name == 'MonoBehaviour':
                    if obj.serialized_type.node:
                        data = obj.read()
                        tree = obj.read_typetree()
                        if 'm_Script' in tree:
                            try:
                                script = data.m_Script.read()
                            except:
                                continue
                            if script.m_ClassName == 'TextMeshPro' and 'm_text' in tree:
                                strings_key = tree['m_text'].replace('\t', '\\t').replace('\n', '\\n')
                                if strings_key in strings and strings[strings_key] != "":
                                    tree['m_text'] = strings[strings_key].replace('\\t', '\t').replace('\\n', '\n')
                                    obj.save_typetree(tree)
                                    needs_saving = True
                                    strings_num += 1
                                    bundle_strings_count += 1
            
            if needs_saving:
                out_bundle_path = os.path.join(out_dir, streaming_assets_path, bundle_name)
                os.makedirs(os.path.dirname(out_bundle_path), exist_ok=True)
                log(f"Writing file: {out_bundle_path} (imported {bundle_strings_count} strings)")
                with open(out_bundle_path, "wb") as f:
                    f.write(env.file.save(packer="original"))
                bundles_num += 1
        except Exception as e:
            log(f"Error processing bundle {bundle_name}: {str(e)}")
            log(traceback.format_exc())

if IMPORT_DIALOGUES:
    for bundle_name in tqdm_wrap(iterable=dialogue_bundles, desc='Importing dialogues:'):
        needs_saving = False
        file_path = os.path.join(bundle_dir, bundle_name)
        log(f"Reading file: {file_path}")
        try:
            env = UnityPy.load(file_path)
            bundle_dialogues_count = 0
            
            for asset_path, obj in env.container.items():
                if 'DialogueDatabaseArchive' in asset_path: # skip archived convos
                    continue
                if obj.type.name == 'MonoBehaviour':
                    try:
                        data = obj.read()
                        script = data.m_Script.read()
                    except:
                        continue

                    if script.m_ClassName == 'DialogueDatabase':
                        # check for typetree availability
                        if not data.object_reader.serialized_type.nodes:
                            continue

                        typetree = data.object_reader.read_typetree()
                        json_data = json.dumps(typetree, indent=4, ensure_ascii=False)

                        # build destination path
                        name = getattr(data, 'm_Name', 'MonoBehaviour')
                        bundle_dest = os.path.join(res_dir, os.path.basename(bundle_name))
                        asset_dir = os.path.join(bundle_dest, os.path.dirname(asset_path))
                        filename = os.path.basename(asset_path) + "-mod.json"
                        typetree_path = os.path.join(asset_dir, filename)

                        if os.path.exists(typetree_path) and os.path.getsize(typetree_path) > 0:
                            log(f"Found modified dialogue: {typetree_path} for {asset_path}")
                            with open(typetree_path, 'r', encoding='utf-8') as f:
                                typetree = json.load(f)
                            
                            if typetree:
                                objd = obj.deref()
                                objd.save_typetree(typetree)
                                needs_saving = True
                                dialogues_num += 1
                                bundle_dialogues_count += 1

            if needs_saving:
                out_bundle_path = os.path.join(out_dir, streaming_assets_path, bundle_name)
                os.makedirs(os.path.dirname(out_bundle_path), exist_ok=True)
                log(f"Writing file: {out_bundle_path} (imported {bundle_dialogues_count} dialogue databases)")
                with open(out_bundle_path, "wb") as f:
                    f.write(env.file.save(packer="original"))
                bundles_num += 1
        except Exception as e:
            log(f"Error processing dialogue bundle {bundle_name}: {str(e)}")
            log(traceback.format_exc())

if IMPORT_TEXTURES:
    if overrides_dir:
        for bundle_name in tqdm_wrap(iterable=texture_bundles, desc='Importing textures:'):
            needs_saving = False
            file_path = os.path.join(bundle_dir, bundle_name)
            log(f"Reading file: {file_path}")
            try:
                env = UnityPy.load(file_path)
                bundle_textures_count = 0
                
                for asset_path, obj in env.container.items():
                    if obj.type.name in ['Texture2D','Sprite']:
                        if asset_path in textures:
                            data = obj.read()
                            if not asset_path.endswith('.png'):
                                asset_path += '.png'
                            override = os.path.join(overrides_dir, os.path.basename(asset_path))
                            if os.path.exists(override):
                                log(f"Found texture override: {override} for {asset_path}")
                                img = Image.open(override)
                                if obj.type.name == 'Sprite':
                                    # Get the original texture associated with this Sprite
                                    data = data.m_RD.texture.read()
                                data.image = img
                                data.save()
                                needs_saving = True
                                textures_num += 1
                                bundle_textures_count += 1

                if needs_saving:
                    out_bundle_path = os.path.join(out_dir, streaming_assets_path, bundle_name)
                    os.makedirs(os.path.dirname(out_bundle_path), exist_ok=True)
                    log(f"Writing file: {out_bundle_path} (imported {bundle_textures_count} textures)")
                    with open(out_bundle_path, "wb") as f:
                        f.write(env.file.save(packer="original"))
                    bundles_num += 1
            except Exception as e:
                log(f"Error processing texture bundle {bundle_name}: {str(e)}")
                log(traceback.format_exc())

post_cmd = os.getenv('POST_CMD')
if post_cmd:
    # Set working directory to two directories up from this script's directory just in case
    work_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    os.chdir(work_dir)
    print('Running post-processing...')
    import subprocess
    if os.name == 'nt':
        result = subprocess.run(post_cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    else:
        result = subprocess.run(post_cmd, shell=True, executable='/bin/sh', stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if result.stderr:
        log(result.stderr)

summary = f"""
[SUMMARY]
Imported I2Languages: 1
Imported strings: {strings_num}
Imported textures: {textures_num}
Imported dialogue databases: {dialogues_num}
Bundles created: {bundles_num}
"""
print()
print(summary.strip())
log(summary)