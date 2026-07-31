"""Shared TextMeshPro override logic.

Used by the Boom Boom Build patcher (patcher.py) and by tools that need to
match TMP objects the exact same way (e.g. Misc/override-TMP), which import
this module via sys.path manipulation.

Overview of the mechanism:
- Misc/override-TMP exports TMP objects for a given string into
  {OVERRIDES_DIR}/TMP/{string} - {parent}.json. Each file carries a 'match'
  block (the reference typography fields + local transform as found in the
  ORIGINAL game files), a 'patch' block (initially identical - this is what
  gets applied, edit this one) and a 'min_similarity' threshold.
- The patcher scans every TMP object in the scene bundles, computes
  tmp_similarity() between the object and each override's 'match' block and,
  when the score reaches 'min_similarity', applies the 'patch' block BEFORE
  the regular string replacement pass (which then still translates m_text if
  it was left unchanged).

The similarity score covers the TMP typography/geometry fields plus the
local transform (position/rotation/scale relative to the parent) of the
GameObject the TMP is attached to. The transform matters because the game
developers copy-pasted signs heavily: many different signs carry TMPs with
byte-identical parameters, and the local position is what tells their
placements apart. m_text is a hard gate: a different string always scores 0.

Score definition (1.0 = exact match of everything):
    score = typography_similarity * geometry_similarity
  - typography_similarity: mean over the whitelisted FINGERPRINT_FIELDS
    (except m_text). Enum/flag fields score 1 (equal) or 0 (different);
    numeric fields score max(0, 1 - |a-b| / tolerance) with the per-field
    tolerances in GRADED_FIELDS below.
  - geometry_similarity: mean of
      position: max(0, 1 - distance / POS_TOLERANCE)
      rotation: 1 - angle_degrees / 180   (quaternion, sign-canonicalized)
      scale:    mean per component of 1 - |a-b| / max(|a|, |b|)
      RectTransform placement (only when both sides have the field):
      m_AnchoredPosition / m_SizeDelta / m_Pivot / m_AnchorMin / m_AnchorMax:
                max(0, 1 - distance / RECT_TOLERANCE)

An override can patch both the TMP typography fields ('tree') and the local
transform of the TMP's GameObject ('transform') - the latter lives in a
separate Transform object and is invisible to the MonoBehaviour itself. The
exported 'chain' (ancestor GameObject names) is informational only - which
sign(s) the file covers - and is not part of the matching.
"""

import json
import math
import hashlib

TMP_OVERRIDE_FORMAT = 'tmp-override'


def is_tmp_tree(tree):
    """Detect a world-space TextMeshPro typetree by structure (the script
    pointer may be cross-bundle). World-space TMP has _SortingLayer/
    _SortingOrder fields; TextMeshProUGUI does not."""
    return 'm_text' in tree and 'm_fontAsset' in tree and '_SortingLayer' in tree


def _is_pptr(node):
    return isinstance(node, dict) and set(node.keys()) == {'m_FileID', 'm_PathID'}


# TMP fields that define the identity of an object for override purposes:
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

# Transform fields defining where the TMP object sits relative to its parent
# (typically a sign). Part of the fingerprint AND independently patchable.
# The RectTransform-only fields (m_Anchor*/m_SizeDelta/m_Pivot) matter a lot:
# TMPs sitting in UI-style hierarchies use them for placement, and they are
# often the ONLY thing telling apart exact TMP clones on different signs
# (same typography, same local TRS, different m_AnchoredPosition).
TRANSFORM_FIELDS = ['m_LocalPosition', 'm_LocalRotation', 'm_LocalScale',
                    'm_AnchorMin', 'm_AnchorMax', 'm_AnchoredPosition',
                    'm_SizeDelta', 'm_Pivot']


def pick_override_fields(tree):
    """Extract the whitelisted geometry/typography fields present in a TMP
    typetree - this is what gets exported into an override file."""
    return {k: tree[k] for k in FINGERPRINT_FIELDS if k in tree}


def pick_transform_fields(transform_tree):
    """Extract the placement fields from a Transform/RectTransform typetree
    (RectTransform-only fields are included when present)."""
    return {k: transform_tree[k] for k in TRANSFORM_FIELDS if k in transform_tree}


def _normalize_floats(node):
    """Recursively map -0.0 to 0.0 - they are numerically equal but serialize
    differently in JSON, which would split fingerprints of identical objects.
    (x + 0.0 is an exact no-op for every float except -0.0.)"""
    if isinstance(node, float):
        return node + 0.0
    if isinstance(node, dict):
        return {k: _normalize_floats(v) for k, v in node.items()}
    if isinstance(node, list):
        return [_normalize_floats(v) for v in node]
    return node


def tmp_fingerprint(mono_tree, transform):
    """sha1 over the canonical JSON of the whitelisted TMP fields plus the
    local TRS of the GameObject the TMP is attached to.

    Not used for override matching (tmp_similarity is) - the exporter uses
    this only to collapse byte-identical objects before clustering. The
    rotation quaternion is canonicalized to the w >= 0 hemisphere first:
    q and -q describe the same rotation and must not produce different
    fingerprints."""
    rot = transform.get('m_LocalRotation')
    if isinstance(rot, dict) and rot.get('w', 1) < 0:
        transform = dict(transform)
        transform['m_LocalRotation'] = {k: -v for k, v in rot.items()}
    payload = json.dumps(_normalize_floats({
        'tree': pick_override_fields(mono_tree),
        'transform': transform,
    }), sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha1(payload.encode('utf-8')).hexdigest()


# ------------------------------------------------------------------
# Similarity scoring (see the module docstring for the definition)
# ------------------------------------------------------------------

# Numeric typography fields compared with a graded score and the difference
# at which their sub-score reaches 0. FINGERPRINT_FIELDS entries not listed
# here (and not m_text) are compared as binary enums/flags.
GRADED_FIELDS = {
    'm_fontSize': 10.0, 'm_fontSizeBase': 10.0,
    'm_fontSizeMin': 10.0, 'm_fontSizeMax': 10.0,
    'm_characterSpacing': 5.0, 'm_wordSpacing': 5.0,
    'm_lineSpacing': 5.0, 'm_lineSpacingMax': 5.0,
    'm_paragraphSpacing': 5.0, 'm_charWidthMaxAdj': 5.0,
    'm_wordWrappingRatios': 0.5, 'm_uvLineOffset': 0.5,
    'm_margin': 5.0,  # per component
}

# Local-position distance at which the position sub-score reaches 0
# (in parent-space units; copy-paste float noise is ~0.01).
POS_TOLERANCE = 1.0

# Same for the RectTransform placement fields (m_AnchoredPosition,
# m_SizeDelta, m_Pivot, m_AnchorMin/Max distances). These are small
# normalized-ish quantities where 0.05 is already a visible difference.
RECT_TOLERANCE = 0.05


def _field_similarity(key, a, b):
    """Sub-score for one typography field; None when not comparable
    (missing on either side or non-numeric graded value) - such fields are
    excluded from the mean entirely."""
    if isinstance(a, bool) or isinstance(b, bool):
        a, b = int(a), int(b)
    tol = GRADED_FIELDS.get(key)
    if tol is not None:
        if isinstance(a, dict) and isinstance(b, dict):
            subs = []
            for comp in ('x', 'y', 'z', 'w'):
                if comp in a and comp in b:
                    subs.append(max(0.0, 1.0 - abs(a[comp] - b[comp]) / tol))
            return sum(subs) / len(subs) if subs else None
        if not (isinstance(a, (int, float)) and isinstance(b, (int, float))):
            return None
        return max(0.0, 1.0 - abs(a - b) / tol)
    return 1.0 if a == b else 0.0


def _vec(node):
    return [node[k] for k in sorted(node.keys())] if isinstance(node, dict) else None


def _quat_angle_deg(a, b):
    """Angle between two rotation quaternions in degrees (0-180)."""
    qa, qb = _vec(a), _vec(b)
    if not qa or not qb:
        return None
    dot = abs(sum(x * y for x, y in zip(qa, qb)))  # abs: q and -q are equal
    return math.degrees(2.0 * math.acos(min(1.0, dot)))


def _geometry_similarity(trans_a, trans_b):
    subs = []
    pa, pb = _vec(trans_a.get('m_LocalPosition')), _vec(trans_b.get('m_LocalPosition'))
    if pa and pb:
        dist = math.dist(pa, pb)
        subs.append(max(0.0, 1.0 - dist / POS_TOLERANCE))
    angle = _quat_angle_deg(trans_a.get('m_LocalRotation'),
                            trans_b.get('m_LocalRotation'))
    if angle is not None:
        subs.append(1.0 - angle / 180.0)
    sa, sb = _vec(trans_a.get('m_LocalScale')), _vec(trans_b.get('m_LocalScale'))
    if sa and sb:
        comps = []
        for x, y in zip(sa, sb):
            hi = max(abs(x), abs(y))
            comps.append(1.0 if hi == 0 else 1.0 - abs(x - y) / hi)
        subs.append(sum(comps) / len(comps))
    # RectTransform placement fields (present only for RectTransforms)
    for key in ('m_AnchoredPosition', 'm_SizeDelta', 'm_Pivot',
                'm_AnchorMin', 'm_AnchorMax'):
        va, vb = _vec(trans_a.get(key)), _vec(trans_b.get(key))
        if va and vb:
            subs.append(max(0.0, 1.0 - math.dist(va, vb) / RECT_TOLERANCE))
    return sum(subs) / len(subs) if subs else 1.0


def tmp_similarity(mono_tree, transform, ref_tree, ref_transform):
    """Similarity between a live TMP object (typetree + its local transform)
    and an override's 'match' reference. 1.0 = exact match of everything;
    0.0 when the strings differ (hard gate)."""
    if mono_tree.get('m_text') != ref_tree.get('m_text'):
        return 0.0
    subs = []
    for key in FINGERPRINT_FIELDS:
        if key == 'm_text' or key not in mono_tree or key not in ref_tree:
            continue
        s = _field_similarity(key, mono_tree[key], ref_tree[key])
        if s is not None:
            subs.append(s)
    typography = sum(subs) / len(subs) if subs else 1.0
    geometry = _geometry_similarity(transform, ref_transform)
    return typography * geometry


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


def merge_transform_override(base, override):
    """Apply the 'transform' block of an override onto the typetree of the
    Transform object the TMP is attached to. Only the whitelisted TRS fields
    are touched (a Transform also holds m_Father/m_Children pointers which
    must never be overwritten)."""
    merged = dict(base)
    for key in TRANSFORM_FIELDS:
        if key in override and not _contains_pptr(override[key]):
            merged[key] = override[key]
    return merged


class HierarchyResolver:
    """Resolves GameObject names and Transform typetrees within one loaded
    bundle, walking the scene hierarchy lazily (with caching) - only the
    objects on the ancestor paths of matched TMPs are ever read.

    Used to locate the Transform object a fingerprint needs (and an override
    patches), and to collect the informational ancestor name chain for
    exports. Only local (m_FileID == 0) pointers are followed: anything else
    ends the chain.
    """

    _TRANSFORM_TYPES = ('Transform', 'RectTransform')

    def __init__(self, env):
        self._objs = {}
        for o in env.objects:
            self._objs[o.path_id] = o
        self._go_trees = {}   # gameobject path_id -> typetree | None
        self._tr_by_id = {}   # transform path_id -> (obj, typetree) | None
        self._tr_by_go = {}   # gameobject path_id -> (obj, typetree) | None

    def _local(self, pptr):
        """Path id of a PPtr if it points into the local file, else None."""
        if _is_pptr(pptr) and pptr['m_FileID'] == 0 and pptr['m_PathID'] != 0:
            return pptr['m_PathID']
        return None

    def _read_tree(self, obj):
        try:
            return obj.read_typetree()
        except Exception:
            return None

    def go_tree(self, go_pid):
        """Typetree of a GameObject by path id (cached, None if unreadable)."""
        if go_pid not in self._go_trees:
            obj = self._objs.get(go_pid)
            tree = None
            if obj is not None and obj.type.name == 'GameObject':
                tree = self._read_tree(obj)
            self._go_trees[go_pid] = tree
        return self._go_trees[go_pid]

    def tr_by_id(self, tr_pid):
        """(obj, typetree) of a Transform/RectTransform by its own path id."""
        if tr_pid not in self._tr_by_id:
            obj = self._objs.get(tr_pid)
            entry = None
            if obj is not None and obj.type.name in self._TRANSFORM_TYPES:
                tree = self._read_tree(obj)
                if tree is not None:
                    entry = (obj, tree)
            self._tr_by_id[tr_pid] = entry
        return self._tr_by_id[tr_pid]

    def tr_by_go(self, go_pid):
        """(obj, typetree) of the Transform/RectTransform component of a
        GameObject, found via the GameObject's m_Component list."""
        if go_pid not in self._tr_by_go:
            entry = None
            go = self.go_tree(go_pid)
            if go is not None:
                for comp in go.get('m_Component', []):
                    pid = self._local(comp.get('component')
                                      if isinstance(comp, dict) else None)
                    if pid is None:
                        continue
                    entry = self.tr_by_id(pid)
                    if entry is not None:
                        break
            self._tr_by_go[go_pid] = entry
        return self._tr_by_go[go_pid]

    def resolve(self, mono_tree):
        """Resolve the anchor of a TMP MonoBehaviour typetree.

        Returns a dict with:
          'chain':          ancestor GameObject names, own GameObject first
                            (informational, NOT part of the fingerprint)
          'transform':      local TRS of the TMP's own GameObject
          'transform_obj':  UnityPy object of that Transform (for patching)
          'transform_tree': typetree of that Transform
        or None if the TMP's own GameObject/Transform cannot be resolved
        (such an object cannot be fingerprinted or patched)."""
        go_pid = self._local(mono_tree.get('m_GameObject'))
        if go_pid is None:
            return None
        chain = []
        transform = None
        transform_obj = None
        transform_tree = None
        for _ in range(64):  # hard depth cap against pathological hierarchies
            go = self.go_tree(go_pid)
            if go is None:
                break
            chain.append(go.get('m_Name', ''))
            tr = self.tr_by_go(go_pid)
            if tr is None:
                break
            tr_obj, tr_tree = tr
            if transform is None:
                transform = pick_transform_fields(tr_tree)
                transform_obj = tr_obj
                transform_tree = tr_tree
            father_pid = self._local(tr_tree.get('m_Father'))
            if father_pid is None:
                break
            father = self.tr_by_id(father_pid)
            if father is None:
                break
            go_pid = self._local(father[1].get('m_GameObject'))
            if go_pid is None:
                break
        if not chain or transform is None:
            return None
        return {
            'chain': chain,
            'transform': transform,
            'transform_obj': transform_obj,
            'transform_tree': transform_tree,
        }
