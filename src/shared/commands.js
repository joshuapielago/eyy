const SLACK_MENTION_REGEX = /<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g;
const GCHAT_MENTION_REGEX = /<users\/([^>]+)>/g;

const LEADERBOARD_TOKEN = /^leaderboard$/i;
const MAX_MESSAGE_LENGTH = 3000;
const ELLIPSIS = '…';

function ensureGlobal(re) {
  return re.global ? re : new RegExp(re.source, re.flags + 'g');
}

function parseSlashCommand(text, { mentionRegex, extractAll = false } = {}) {
  const trimmed = (text || '').trim();

  if (LEADERBOARD_TOKEN.test(trimmed)) {
    return { kind: 'leaderboard' };
  }

  if (!mentionRegex) {
    return { kind: 'kudos', recipientIds: [], message: trimAndTruncate(trimmed) };
  }

  const re = ensureGlobal(mentionRegex);
  const matches = [];
  let m;
  while ((m = re.exec(trimmed)) !== null) {
    matches.push({ id: m[1], full: m[0], index: m.index, length: m[0].length });
  }

  let recipientIds = [];
  let messageText = trimmed;

  if (extractAll) {
    const seen = new Set();
    for (const match of matches) {
      if (!seen.has(match.id)) {
        seen.add(match.id);
        recipientIds.push(match.id);
      }
    }
    messageText = stripMentions(trimmed, matches);
  } else if (matches.length > 0) {
    recipientIds = [matches[0].id];
    messageText = stripMentions(trimmed, [matches[0]]);
  }

  return {
    kind: 'kudos',
    recipientIds,
    message: trimAndTruncate(messageText),
  };
}

function stripMentions(text, mentionsToRemove) {
  // Process matches in reverse so indices stay valid as we splice.
  let result = text;
  const sorted = [...mentionsToRemove].sort((a, b) => b.index - a.index);
  for (const match of sorted) {
    result = result.slice(0, match.index) + result.slice(match.index + match.length);
  }
  return result;
}

function trimAndTruncate(text) {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= MAX_MESSAGE_LENGTH) return collapsed;
  return collapsed.slice(0, MAX_MESSAGE_LENGTH - 1) + ELLIPSIS;
}

module.exports = {
  parseSlashCommand,
  SLACK_MENTION_REGEX,
  GCHAT_MENTION_REGEX,
  MAX_MESSAGE_LENGTH,
};
