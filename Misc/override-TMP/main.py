"""override-TMP: export TextMeshPro object overrides for a given string.

Finds all world-space TextMeshPro objects in the scene bundles whose m_text
exactly matches the given string, groups byte-identical objects together and
then clusters the groups by similarity (complete linkage: every member of a
cluster scores >= threshold against every other member). One JSON per cluster
is exported into {OVERRIDES_DIR}/TMP as "{string} - {parent}.json" (numbered
"-2" and so on when several clusters share string and parent name).

The similarity score (see tmp_override.py for the exact definition) covers
all whitelisted TMP typography/geometry params plus the local transform
(position/rotation/scale relative to the parent) of the GameObject the TMP
is attached to: 1.0 is an exact match of everything, lower thresholds also
match "almost the same" objects (e.g. copy-paste float noise). The transform
matters because the game heavily reuses copy-pasted signs: TMPs on different
signs can have byte-identical parameters, and the local position is what
tells their placements apart.

Each exported file carries:
  min_similarity:  the threshold (the CLI value - edit to re-tune matching)
  chain:           informational only: ancestor GameObject names of the
                   reference object, i.e. which sign the file was exported
                   from (one file may cover several different signs)
  match:           the reference object the similarity is computed against
                   (as found in the ORIGINAL game files - normally do not
                   edit; editing re-targets which objects get patched;
                   deleting fields excludes them from the score entirely)
  patch:           what gets applied to matched objects - starts EMPTY on
                   export, so nothing is overwritten by default: copy the
                   fields you want to change from 'match' into 'patch'
                   (typography fields and/or local position/rotation/scale)
                   and edit them there. Only the listed fields are applied,
                   everything else stays as-is in each matched object

bbb applies the patch block to every TMP object of the same string whose
similarity to the match block reaches min_similarity, before the regular
string replacement pass (which then still translates m_text if it was left
unchanged). Delete the files of signs you don't want to touch. Matching is
done purely by score - bbb always does a full scan over the current game
files, so bundle/object ids changing between game patches don't matter.

Usage:
    npm run tool:override-TMP -- <min_similarity 0.1-1.0> "<exact string>"
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
    HierarchyResolver,
    is_tmp_tree,
    pick_override_fields,
    tmp_fingerprint,
    tmp_similarity,
)

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

USAGE = 'Usage: npm run tool:override-TMP -- <min_similarity 0.1-1.0> "<exact string>"'

if len(sys.argv) < 3:
    print(USAGE)
    sys.exit(1)

try:
    threshold = float(sys.argv[1])
except ValueError:
    print(f"Error: min_similarity '{sys.argv[1]}' is not a number.")
    print(USAGE)
    sys.exit(1)
if not 0.1 <= threshold <= 1.0:
    print(f"Error: min_similarity must be between 0.1 and 1.0 (got {threshold}).")
    sys.exit(1)

target_string = sys.argv[2]
if not target_string:
    print(USAGE)
    sys.exit(1)

# shells do not expand escape sequences inside quotes, so a multiline string
# passed as "line1\nline2" arrives with literal backslashes - unescape the
# common sequences to match the real m_text contents
target_string = (target_string
                 .replace('\\n', '\n')
                 .replace('\\r', '\r')
                 .replace('\\t', '\t'))

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

# fingerprint -> {'tree', 'chain', 'transform', 'parents', 'occurrences'}
# occurrences/parents are only used for the console summary, they are NOT
# exported: bundle names and object ids can change between game patches, so
# bbb always does a full scan with similarity scoring instead of relying on
# stored locations
found = {}
objects_num = 0
unanchored_num = 0

bar_format = "{desc:<21}{percentage:3.0f}%|{bar}{r_bar}"
for bundle_name in tqdm(scene_bundles, desc='Scanning TMP objects:',
                        bar_format=bar_format, ascii=(os.name == 'nt')):
    file_path = os.path.join(bundle_dir, bundle_name)
    try:
        env = UnityPy.load(file_path)
    except Exception as e:
        print(f'\nWarning: failed to load {bundle_name}: {e}')
        continue
    resolver = None  # created lazily on first matching TMP in this bundle
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
        if resolver is None:
            resolver = HierarchyResolver(env)
        anchor = resolver.resolve(tree)
        if anchor is None:
            unanchored_num += 1
            continue
        h = tmp_fingerprint(tree, anchor['transform'])
        entry = found.setdefault(h, {'tree': tree,
                                     'chain': anchor['chain'],
                                     'transform': anchor['transform'],
                                     'parents': set(),
                                     'occurrences': []})
        entry['occurrences'].append(bundle_name)
        entry['parents'].add(anchor['chain'][1] if len(anchor['chain']) > 1
                             else anchor['chain'][0])

print()
if objects_num == 0:
    print(f'No TextMeshPro objects found with the exact string: {target_string!r}')
    sys.exit(0)
if unanchored_num:
    print(f'Warning: {unanchored_num} object(s) skipped - could not resolve '
          f'their GameObject/Transform hierarchy')

# ------------------------------------------------------------------
# Cluster the unique objects by similarity (complete linkage: a merge
# happens only when EVERY cross-pair scores >= threshold, which guarantees
# every cluster member scores >= threshold against the exported reference)
# ------------------------------------------------------------------

groups = [{'fp': h, **entry} for h, entry in sorted(found.items())]
n = len(groups)

# pairwise similarity between group representatives
sims = [[0.0] * n for _ in range(n)]
for i in range(n):
    sims[i][i] = 1.0
    for j in range(i + 1, n):
        s = tmp_similarity(groups[i]['tree'], groups[i]['transform'],
                           groups[j]['tree'], groups[j]['transform'])
        sims[i][j] = sims[j][i] = s

clusters = [{i} for i in range(n)]
while True:
    best = None  # (min pairwise sim, cluster idx a, cluster idx b)
    for a in range(len(clusters)):
        for b in range(a + 1, len(clusters)):
            ms = min(sims[i][j] for i in clusters[a] for j in clusters[b])
            if ms >= threshold and (best is None or ms > best[0]):
                best = (ms, a, b)
    if best is None:
        break
    _, a, b = best
    clusters[a] |= clusters[b]
    del clusters[b]

# representative: member with the smallest fingerprint (deterministic)
clusters = [sorted(c, key=lambda i: groups[i]['fp']) for c in clusters]
clusters.sort(key=lambda c: groups[c[0]]['fp'])

out_dir = os.path.join(overrides_dir, 'TMP')
os.makedirs(out_dir, exist_ok=True)

name_part = sanitize_filename(target_string)
created = 0
skipped = 0
used_names = {}
for cluster in clusters:
    rep = groups[cluster[0]]
    chain = rep['chain']
    parent_part = sanitize_filename(chain[1] if len(chain) > 1 else chain[0])
    base = f'{name_part} - {parent_part}'
    n_used = used_names.get(base, 0) + 1
    used_names[base] = n_used
    suffix = '' if n_used == 1 else f'-{n_used}'
    out_path = os.path.join(out_dir, f'{base}{suffix}.json')
    occurrences = sum(len(groups[i]['occurrences']) for i in cluster)
    bundles = len({b for i in cluster for b in groups[i]['occurrences']})
    parents = sorted({p for i in cluster for p in groups[i]['parents']})
    print(f"{len(cluster)} unique object(s), {occurrences} occurrence(s) "
          f"in {bundles} bundle(s)")
    print(f"  chain: {' <- '.join(chain)}")
    rep_parent = chain[1] if len(chain) > 1 else chain[0]
    others = [p for p in parents if p != rep_parent]
    if others:
        print(f"  (also covers: {', '.join(others)})")
    if os.path.exists(out_path):
        print(f'  -> skipped (already exists, remove it first to re-export): {out_path}')
        skipped += 1
        continue
    match = {
        'transform': rep['transform'],
        'tree': pick_override_fields(rep['tree']),
    }
    payload = {
        'format': TMP_OVERRIDE_FORMAT,
        'min_similarity': threshold,
        'chain': chain,
        'match': match,
        # starts empty on purpose: nothing is overwritten unless the user
        # explicitly copies fields from 'match' into 'patch' and edits them
        'patch': {'transform': {}, 'tree': {}},
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(json.dumps(payload, indent=2, ensure_ascii=False))
    print(f'  -> {out_path}')
    created += 1

print()
print('[SUMMARY]')
print(f'Objects found with this string: {objects_num}')
print(f'Unique objects:                 {len(groups)}')
print(f'Clusters at threshold {threshold}:   {len(clusters)}')
print(f'Overrides created:              {created}')
if skipped:
    print(f'Skipped (already exist):        {skipped}')
