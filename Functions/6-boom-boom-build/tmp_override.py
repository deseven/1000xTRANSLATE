"""Shared TextMeshPro override logic.

Used by the Boom Boom Build patcher (patcher.py) and by tools that need to
fingerprint TMP objects the exact same way (e.g. Misc/override-TMP), which
import this module via sys.path manipulation.

Overview of the mechanism:
- Misc/override-TMP exports the geometry/typography fields of TMP objects for
  a given string into {OVERRIDES_DIR}/TMP/{string}-{hash}.json, where {hash}
  is tmp_fingerprint() of the object as found in the ORIGINAL game files.
- The patcher scans every TMP object in the scene bundles, computes the same
  fingerprint and, if a matching override exists, applies it with
  merge_tmp_override() BEFORE the regular string replacement pass (which then
  still translates m_text if it was left unchanged).
"""

import json
import hashlib

TMP_OVERRIDE_FORMAT = 'tmp-override'


def is_tmp_tree(tree):
    """Detect a world-space TextMeshPro typetree by structure (the script
    pointer may be cross-bundle). World-space TMP has _SortingLayer/
    _SortingOrder fields; TextMeshProUGUI does not."""
    return 'm_text' in tree and 'm_fontAsset' in tree and '_SortingLayer' in tree


def _is_pptr(node):
    return isinstance(node, dict) and set(node.keys()) == {'m_FileID', 'm_PathID'}


# Fields that define the identity of a TMP object for override purposes:
# the string itself plus geometry/typography parameters. Everything else
# (asset pointers, colors, renderer state, ...) is irrelevant here - pointers
# are also bundle-local and differ between copies of the same object.
FINGERPRINT_FIELDS = [
    # the string itself - two objects with identical geometry but different
    # text must never share an override
    'm_text',
    # font size / auto sizing
    'm_fontSize', 'm_fontSizeBase', 'm_fontSizeMin', 'm_fontSizeMax',
    'm_enableAutoSizing', 'm_fontWeight', 'm_fontStyle',
    # alignment
    'm_HorizontalAlignment', 'm_VerticalAlignment', 'm_textAlignment',
    # spacing
    'm_characterSpacing', 'm_wordSpacing', 'm_lineSpacing', 'm_lineSpacingMax',
    'm_paragraphSpacing', 'm_charWidthMaxAdj',
    # wrapping / overflow
    'm_enableWordWrapping', 'm_TextWrappingMode', 'm_wordWrappingRatios',
    'm_overflowMode',
    # kerning / padding / margins
    'm_enableKerning', 'm_enableExtraPadding', 'checkPaddingRequired',
    'm_margin',
    # texture mapping / geometry sorting
    'm_horizontalMapping', 'm_verticalMapping', 'm_uvLineOffset',
    'm_geometrySortingOrder',
    # pagination / visibility
    'm_useMaxVisibleDescender', 'm_pageToDisplay',
    # misc geometry-affecting flags
    'm_isRightToLeft', 'm_isOrthographic', 'm_isVolumetricText', 'm_maskType',
    'm_IsTextObjectScaleStatic', 'm_VertexBufferAutoSizeReduction',
]


def pick_override_fields(tree):
    """Extract the whitelisted geometry/typography fields present in a TMP
    typetree - this is what gets exported into an override file."""
    return {k: tree[k] for k in FINGERPRINT_FIELDS if k in tree}


def tmp_fingerprint(tree):
    """sha1 over the canonical JSON of the whitelisted typetree fields."""
    payload = json.dumps(pick_override_fields(tree),
                         sort_keys=True, ensure_ascii=False,
                         separators=(',', ':'))
    return hashlib.sha1(payload.encode('utf-8')).hexdigest()


def _contains_pptr(node):
    if _is_pptr(node):
        return True
    if isinstance(node, dict):
        return any(_contains_pptr(v) for v in node.values())
    if isinstance(node, list):
        return any(_contains_pptr(v) for v in node)
    return False


def merge_tmp_override(base, override):
    """Apply an exported TMP override onto the target object's typetree.

    The override only carries the fields that are meant to be changed
    (geometry/typography/...), everything else stays as-is. Values containing
    asset pointers are skipped entirely - pointer ids are bundle-local, so
    ones coming from an override file would be meaningless or harmful."""
    merged = dict(base)
    for key, value in override.items():
        if _contains_pptr(value):
            continue
        merged[key] = value
    return merged
