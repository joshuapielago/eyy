const USER_MENTION_REGEX = /<users\/([^>]+)>/g;

function parseUserMentions(text) {
  if (!text) return [];
  const seen = new Set();
  const out = [];
  let m;
  const re = new RegExp(USER_MENTION_REGEX.source, 'g');
  while ((m = re.exec(text)) !== null) {
    const id = m[1];
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function namesFromAnnotations(annotations) {
  // Returns Map<userId, displayName> built from USER_MENTION annotations.
  // Useful for the slash-command path where Google Chat ships rich annotations.
  const map = new Map();
  for (const a of annotations || []) {
    if (a.type !== 'USER_MENTION') continue;
    const user = a.userMention?.user;
    if (!user) continue;
    const id = user.name || '';
    const name = user.displayName || '';
    if (id) map.set(id, name);
  }
  return map;
}

function resolveRecipientsFromInput(formText, annotations) {
  // Combine: parse mentions from a textInput value (raw <users/N> tokens),
  // then enrich names from any annotations on the originating message.
  const ids = parseUserMentions(formText);
  const names = namesFromAnnotations(annotations);
  return ids.map((id) => ({
    id,
    name: names.get(id) || '',
    email: '',
  }));
}

function userIdFromGoogleUser(user) {
  // Normalizes a Google Chat user object to an ID.
  // Handles {name: 'users/123'} and {name: '123'} shapes.
  if (!user?.name) return '';
  const n = String(user.name);
  return n.startsWith('users/') ? n : `users/${n}`;
}

module.exports = {
  parseUserMentions,
  namesFromAnnotations,
  resolveRecipientsFromInput,
  userIdFromGoogleUser,
  USER_MENTION_REGEX,
};
