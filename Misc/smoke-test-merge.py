"""Throwaway smoke test for the merge-based patcher logic.

Verifies that ResourcePatcher._apply_i2_patch / _apply_dialogue_patch /
_resolve_language_index patch ONLY the targeted fields of original assets
extracted from !resources/ (no wholesale replacement).

Run from the repo root:
    Functions/6-boom-boom-build/.venv/bin/python Misc/smoke-test-merge.py
"""
import copy
import glob
import json
import sys

sys.path.insert(0, 'Functions/6-boom-boom-build')
from patcher import ResourcePatcher  # noqa: E402

p = object.__new__(ResourcePatcher)
logs = []
p.log = logs.append

# ---------- I2Languages merge ----------
with open('!resources/I2Languages.json') as f:
    tree = json.load(f)
orig = copy.deepcopy(tree)
terms = tree['mSource']['mTerms']
t0, t1 = terms[0]['Term'], terms[5]['Term']
p._i2_patch = {
    'format': 'i2languages-patch',
    'target_lang': 'zh',
    'terms': {t0: 'TEST0', t1: 'TEST1', 'NoSuch/Term': 'X'},
}
applied = p._apply_i2_patch(tree)
assert applied == 2, f"expected 2, got {applied}"
assert terms[0]['Languages'][1] == 'TEST0'
assert terms[5]['Languages'][1] == 'TEST1'
# nothing else may have changed
chk = copy.deepcopy(tree)
chk['mSource']['mTerms'][0]['Languages'][1] = orig['mSource']['mTerms'][0]['Languages'][1]
chk['mSource']['mTerms'][5]['Languages'][1] = orig['mSource']['mTerms'][5]['Languages'][1]
assert chk == orig, "I2 tree differs beyond the targeted fields"
# language index resolution against the original mLanguages
assert p._resolve_language_index(tree['mSource'], 'zh') == 1
assert p._resolve_language_index(tree['mSource'], 'pt-BR') == 5
assert p._resolve_language_index(tree['mSource'], 'ja') == 2
assert p._resolve_language_index(tree['mSource'], 'Chinese') == 1
assert p._resolve_language_index(tree['mSource'], 'pt') == 5  # prefix match
print("I2 merge: OK (applied 2, skipped 1 unknown term, tree otherwise identical)")

# ---------- Dialogue DB merge ----------
f = glob.glob('!resources/**/8_CH2_AllmoMurder.asset.json', recursive=True)[0]
with open(f) as fh:
    db = json.load(fh)
orig = copy.deepcopy(db)
patch = {'format': 'dialogue-patch', 'target_lang': 'zh',
         'actors': {}, 'items': {}, 'dialogues': {}}

# actor with a Display Name zh field (type 4, fallback type 0)
actor = name = a_df = None
for a in db.get('actors', []):
    nf = next((x for x in a['fields'] if x['type'] == 0 and x['title'] == 'Name'), None)
    if not nf:
        continue
    df = next((x for x in a['fields'] if x['type'] == 4 and x['title'] == 'Display Name zh'), None) \
        or next((x for x in a['fields'] if x['type'] == 0 and x['title'] == 'Display Name zh'), None)
    if df:
        actor, name, a_df = a, nf['value'], df
        break
assert actor is not None, "no actor with Display Name zh found"
patch['actors'][name] = 'ACTOR_ZH'

# entry with a type-4 'zh' dialogue field
found = None
for conv in db['conversations']:
    title = next((x['value'] for x in conv['fields']
                  if x['type'] == 0 and str(x['title']).lower() == 'title'), None)
    for e in conv.get('dialogueEntries', []):
        if any(x['type'] == 4 and x['title'] == 'zh' for x in e['fields']):
            found = (title, e['id'])
            break
    if found:
        break
assert found, "no zh dialogue field found in sample DB"
patch['dialogues'][f"{found[0]}/{found[1]}/DialogueText"] = 'LINE_ZH'
patch['dialogues']['Ghost/Conv/999/DialogueText'] = 'GHOST'  # must be skipped

applied = p._apply_dialogue_patch(db, patch)
assert applied == 2, f"expected 2, got {applied}"
assert a_df['value'] == 'ACTOR_ZH'
entry = next(e for c in db['conversations'] for e in c['dialogueEntries'] if e['id'] == found[1])
assert next(x for x in entry['fields'] if x['type'] == 4 and x['title'] == 'zh')['value'] == 'LINE_ZH'

# nothing else may have changed: restore the two patched values via their
# precise locations (entry ids are only unique within a conversation) and
# compare the whole DB against the original
a_df['value'] = next(
    y for a2 in orig['actors'] if any(x for x in a2['fields']
                                      if x['type'] == 0 and x['title'] == 'Name'
                                      and x['value'] == name)
    for y in a2['fields']
    if y['title'] == 'Display Name zh')['value']
conv = next(c for c in db['conversations']
            if any(x for x in c['fields'] if x['type'] == 0
                   and str(x['title']).lower() == 'title'
                   and x['value'] == found[0]))
entry_in_conv = next(e for e in conv['dialogueEntries'] if e['id'] == found[1])
orig_conv = next(c for c in orig['conversations']
                 if any(x for x in c['fields'] if x['type'] == 0
                        and str(x['title']).lower() == 'title'
                        and x['value'] == found[0]))
orig_entry = next(e for e in orig_conv['dialogueEntries'] if e['id'] == found[1])
next(x for x in entry_in_conv['fields'] if x['type'] == 4 and x['title'] == 'zh')['value'] = \
    next(y for y in orig_entry['fields'] if y['type'] == 4 and y['title'] == 'zh')['value']
assert db == orig, "dialogue DB differs beyond the targeted fields"
print("Dialogue merge: OK (applied 2, ghost key skipped, DB otherwise identical)")
print("ALL SMOKE TESTS PASSED")
