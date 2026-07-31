"""override-TMP: export TextMeshPro object overrides for a given string.

Finds all world-space TextMeshPro objects in the scene bundles whose m_text
exactly matches the string passed as a command line argument, fingerprints each
object (sha1 over a whitelist of geometry/typography typetree fields plus the
string itself) and exports one JSON per unique fingerprint into
{OVERRIDES_DIR}/TMP as {string}.json (numbered {string}-2.json and so on when
there are several unique objects with the same string). Only the whitelisted
geometry/typography fields are exported - those are both the hash base and
the only fields an override can change.

Edit the exported JSON files (text geometry, alignment, margins, font size,
whatever is needed) and bbb will apply them to ALL copies of the matching
objects before the regular string replacement pass (which then still translates
m_text if it was left unchanged). Matching is done purely by fingerprint - bbb
always does a full scan over the current game files, so bundle/object ids
changing between game patches don't matter.

Usage:
    npm run tool:override-TMP -- "<exact string>"
"""

import os
import re
import sys
import json
import warnings
from dotenv import load_dotenv
from tqdm import tqdm
import UnityPy

# shared TMP override logic lives in the bbb function
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..',
                                'Functions', '6-boom-boom-build'))
from tmp_override import (
    TMP_OVERRIDE_FORMAT,
    is_tmp_tree,
    pick_override_fields,
    tmp_fingerprint,
)

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

if len(sys.argv) < 2 or not sys.argv[1]:
    print('Usage: npm run tool:override-TMP -- "<exact string>"')
    sys.exit(1)

target_string = sys.argv[1]

# Handle both relative and absolute paths
def get_path(env_var):
    path = os.getenv(env_var)
    if path is None:
        return ''
    if os.path.isabs(path):
        return path
    return os.path.join(os.path.dirname(__file__), '..', '..', path)

data_dir      = get_path('GAME_DATA_DIR')
overrides_dir = get_path('OVERRIDES_DIR')

if not data_dir or not os.path.isdir(data_dir):
    print(f"Error: GAME_DATA_DIR '{os.getenv('GAME_DATA_DIR')}' does not exist or is not a directory.")
    sys.exit(1)
if not overrides_dir:
    print("Error: OVERRIDES_DIR is not set.")
    sys.exit(1)

bundle_dir = os.path.join(data_dir, 'StreamingAssets', 'aa', 'StandaloneWindows64')
if not os.path.isdir(bundle_dir):
    print(f"Error: bundle directory '{bundle_dir}' does not exist.")
    sys.exit(1)

# Suppress UnityVersionFallbackWarning since we're explicitly setting the fallback version
warnings.filterwarnings('ignore', category=UnityPy.config.UnityVersionFallbackWarning)

if os.getenv('UNITYPY_USE_PYTHON_PARSER') == 'true':
    from UnityPy.helpers import TypeTreeHelper
    TypeTreeHelper.read_typetree_boost = False


def detect_unity_version(game_data_dir):
    """Detect the Unity version by reading resources.assets from the game data directory."""
    try:
        env = UnityPy.load(os.path.join(game_data_dir, 'resources.assets'))
        for sf in env.files.values():
            if hasattr(sf, 'unity_version') and sf.unity_version:
                return sf.unity_version
    except Exception:
        pass
    return None


unity_version = detect_unity_version(data_dir)
if not unity_version or not unity_version.startswith('6000'):
    print(f"Error: this game version is not supported (detected: {unity_version})")
    sys.exit(1)
UnityPy.config.FALLBACK_UNITY_VERSION = unity_version


def sanitize_filename(s, max_len=64):
    """Strip everything that is not [a-zA-Z0-9-_ ] - the string part of the
    filename is only for human readability."""
    s = re.sub(r'[^a-zA-Z0-9\-_ ]', '', s)
    s = re.sub(r' {2,}', ' ', s).strip()
    return s[:max_len].strip() or 'string'


scene_bundles = sorted(f for f in os.listdir(bundle_dir)
                       if f.endswith('.bundle') and '_scenes_' in f)

# fingerprint -> {'tree': tree, 'occurrences': [bundle, ...]} - occurrences are
# only used for the console summary, they are NOT exported: bundle names and
# object ids can change between game patches, so bbb always does a full scan
# with hash calculation instead of relying on stored locations
found = {}
objects_num = 0

bar_format = "{desc:<21}{percentage:3.0f}%|{bar}{r_bar}"
for bundle_name in tqdm(scene_bundles, desc='Scanning TMP objects:',
                        bar_format=bar_format, ascii=(os.name == 'nt')):
    file_path = os.path.join(bundle_dir, bundle_name)
    try:
        env = UnityPy.load(file_path)
    except Exception as e:
        print(f'\nWarning: failed to load {bundle_name}: {e}')
        continue
    for obj in env.objects:
        if obj.type.name != 'MonoBehaviour':
            continue
        if not obj.serialized_type.nodes:
            continue
        try:
            tree = obj.read_typetree()
        except Exception:
            continue
        if not is_tmp_tree(tree):
            continue
        if tree['m_text'] != target_string:
            continue
        objects_num += 1
        h = tmp_fingerprint(tree)
        entry = found.setdefault(h, {'tree': tree, 'occurrences': []})
        entry['occurrences'].append(bundle_name)

print()
if objects_num == 0:
    print(f'No TextMeshPro objects found with the exact string: {target_string!r}')
    sys.exit(0)

out_dir = os.path.join(overrides_dir, 'TMP')
os.makedirs(out_dir, exist_ok=True)

name_part = sanitize_filename(target_string)
created = 0
skipped = 0
for i, (h, entry) in enumerate(sorted(found.items())):
    suffix = '' if i == 0 else f'-{i + 1}'
    out_path = os.path.join(out_dir, f'{name_part}{suffix}.json')
    bundles = len(set(entry['occurrences']))
    print(f"{h}: {len(entry['occurrences'])} object(s) in {bundles} bundle(s)")
    if os.path.exists(out_path):
        print(f'  -> skipped (already exists, remove it first to re-export): {out_path}')
        skipped += 1
        continue
    payload = {
        'format': TMP_OVERRIDE_FORMAT,
        'hash': h,
        'tree': pick_override_fields(entry['tree']),
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(json.dumps(payload, indent=2, ensure_ascii=False))
    print(f'  -> {out_path}')
    created += 1

print()
print('[SUMMARY]')
print(f'Objects found with this string: {objects_num}')
print(f'Unique objects:                 {len(found)}')
print(f'Overrides created:              {created}')
if skipped:
    print(f'Skipped (already exist):        {skipped}')
