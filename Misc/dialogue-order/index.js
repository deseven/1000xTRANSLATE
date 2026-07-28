// Shared logic for ordering dialogue entries "naturally" (the way a conversation
// actually flows) instead of the raw numeric id order.
//
// Background (1000xRESIST uses Dialogue System for Unity):
// - every conversation has a dummy entry with id 0 titled "START" which holds no text;
// - each entry has outgoingLinks, each link pointing to destinationDialogueID;
// - links never leave their conversation (verified on the full dataset);
// - branch nodes (player choices) have multiple outgoing links; for those we use the
//   node's canvas position (canvasRect.x, then .y) as the display-order heuristic,
//   since that reflects how the author laid out the choices in the editor.

const START_NODE_ID = 0;

/**
 * Orders dialogue entries of a single conversation by following outgoing links
 * depth-first, starting from the START node (id 0).
 *
 * - branch links are followed in order of the destination node's canvasRect.x
 *   (then .y, then id) so player choices appear in their visual left-to-right order;
 * - entries unreachable from START (orphans) are appended at the end of the block,
 *   traversed the same way starting from the lowest orphan id;
 * - the START node itself is never included in the result.
 *
 * @param {Array} dialogueEntries conversation.dialogueEntries from the dialogue database
 * @returns {Array} the same entry objects in natural order
 */
function orderConversationEntries(dialogueEntries) {
    if (!Array.isArray(dialogueEntries) || dialogueEntries.length === 0) {
        return [];
    }

    const byId = new Map(dialogueEntries.map(e => [e.id, e]));
    const visited = new Set();
    const ordered = [];

    // links of an entry sorted by the destination node's canvas position
    const sortedLinks = (entry) => (entry.outgoingLinks || [])
        .filter(link => byId.has(link.destinationDialogueID))
        .slice()
        .sort((a, b) => {
            const entryA = byId.get(a.destinationDialogueID);
            const entryB = byId.get(b.destinationDialogueID);
            const xA = entryA.canvasRect?.x ?? 0;
            const xB = entryB.canvasRect?.x ?? 0;
            if (xA !== xB) return xA - xB;
            const yA = entryA.canvasRect?.y ?? 0;
            const yB = entryB.canvasRect?.y ?? 0;
            if (yA !== yB) return yA - yB;
            return a.destinationDialogueID - b.destinationDialogueID;
        });

    // iterative depth-first traversal (chains can be too long for recursion)
    const stack = [];
    const drain = () => {
        while (stack.length > 0) {
            const id = stack.pop();
            if (visited.has(id)) continue;
            visited.add(id);
            const entry = byId.get(id);
            ordered.push(entry);
            const links = sortedLinks(entry);
            for (let i = links.length - 1; i >= 0; i--) {
                if (!visited.has(links[i].destinationDialogueID)) {
                    stack.push(links[i].destinationDialogueID);
                }
            }
        }
    };

    // seed with whatever the START node points to
    const startNode = byId.get(START_NODE_ID);
    if (startNode) {
        const links = sortedLinks(startNode);
        for (let i = links.length - 1; i >= 0; i--) {
            stack.push(links[i].destinationDialogueID);
        }
        visited.add(START_NODE_ID);
        drain();
    }

    // sweep orphans (unreachable from START), lowest id first, following their links too
    const orphans = dialogueEntries
        .filter(e => !visited.has(e.id))
        .sort((a, b) => a.id - b.id);
    for (const entry of orphans) {
        if (!visited.has(entry.id)) {
            stack.push(entry.id);
            drain();
        }
    }

    return ordered;
}

/**
 * Builds the desired sheet row order from the current sheet keys and a ranked
 * ("naturally ordered") key list.
 *
 * - keys found in rankedKeys are sorted by their rank;
 * - unknown keys keep their relative order and stay right after the previous known
 *   key (i.e. at the end of their current block); unknown keys above any known key
 *   stay at the top of the sheet.
 *
 * Matching is case-insensitive (the sheet is treated case-insensitively elsewhere),
 * returned keys keep the casing found in currentKeys.
 *
 * @param {string[]} currentKeys keys in their current sheet row order
 * @param {string[]} rankedKeys keys in the desired natural order
 * @returns {string[]} a permutation of currentKeys
 */
function buildTargetOrder(currentKeys, rankedKeys) {
    const rank = new Map();
    rankedKeys.forEach((key, i) => {
        const lower = key.toLowerCase();
        if (!rank.has(lower)) rank.set(lower, i);
    });

    const EPS = 1e-6;
    const effective = new Array(currentKeys.length);
    let prev = -1;
    let streak = 0;
    for (let i = 0; i < currentKeys.length; i++) {
        const known = rank.get(currentKeys[i].toLowerCase());
        if (known !== undefined) {
            effective[i] = known;
            prev = known;
            streak = 0;
        } else {
            streak++;
            effective[i] = prev + streak * EPS;
        }
    }

    return currentKeys
        .map((key, i) => ({ key, order: effective[i] }))
        .sort((a, b) => a.order - b.order) // Array.sort is stable (ES2019+)
        .map(item => item.key);
}

/**
 * Computes a sequence of single-row moves that transforms current into target.
 * Every move takes the row at `from` and inserts it at `to` (always from > to,
 * i.e. rows are only ever moved up), applied sequentially.
 *
 * @param {Array} current current order of unique row identifiers
 * @param {Array} target desired order (must be a permutation of current)
 * @returns {{from: number, to: number}[]} zero-based move operations
 */
function computeMoves(current, target) {
    const work = current.slice();
    const moves = [];
    for (let i = 0; i < target.length; i++) {
        if (work[i] === target[i]) continue;
        const j = work.indexOf(target[i], i + 1);
        if (j === -1) continue; // target is not a permutation; skip defensively
        work.splice(i, 0, work.splice(j, 1)[0]);
        moves.push({ from: j, to: i });
    }
    return moves;
}

module.exports = { orderConversationEntries, buildTargetOrder, computeMoves };

// when run directly (via run:tool dialogue-order), just print what this is
if (require.main === module) {
    console.log('dialogue-order is a shared module used by the sheetifier and the sort-dialogues tool.');
    console.log('It is not meant to be run on its own.');
}
