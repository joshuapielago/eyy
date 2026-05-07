const {
  parseUserMentions,
  namesFromAnnotations,
  resolveRecipientsFromInput,
  userIdFromGoogleUser,
} = require('../../src/platforms/google-chat/identity');

describe('parseUserMentions', () => {
  test('returns empty array for empty input', () => {
    expect(parseUserMentions('')).toEqual([]);
    expect(parseUserMentions(null)).toEqual([]);
    expect(parseUserMentions(undefined)).toEqual([]);
  });

  test('extracts a single user mention id', () => {
    expect(parseUserMentions('<users/123> hello')).toEqual(['123']);
  });

  test('extracts multiple ids in order', () => {
    expect(parseUserMentions('<users/A> <users/B> <users/C> hi')).toEqual(['A', 'B', 'C']);
  });

  test('dedupes repeated ids', () => {
    expect(parseUserMentions('<users/A> <users/B> <users/A>')).toEqual(['A', 'B']);
  });

  test('handles ids with hyphens, underscores, and mixed case', () => {
    expect(parseUserMentions('<users/abc-DEF_xyz>')).toEqual(['abc-DEF_xyz']);
  });

  test('returns empty array when no mentions present', () => {
    expect(parseUserMentions('hello world')).toEqual([]);
  });
});

describe('namesFromAnnotations', () => {
  test('returns empty map for empty/missing input', () => {
    expect(namesFromAnnotations(undefined).size).toBe(0);
    expect(namesFromAnnotations(null).size).toBe(0);
    expect(namesFromAnnotations([]).size).toBe(0);
  });

  test('builds a map of user id to displayName', () => {
    const ann = [
      { type: 'USER_MENTION', userMention: { user: { name: 'users/123', displayName: 'Alice' } } },
      { type: 'USER_MENTION', userMention: { user: { name: 'users/456', displayName: 'Bob' } } },
    ];
    const map = namesFromAnnotations(ann);
    expect(map.get('users/123')).toBe('Alice');
    expect(map.get('users/456')).toBe('Bob');
  });

  test('skips non-USER_MENTION annotations', () => {
    const ann = [
      { type: 'SLASH_COMMAND' },
      { type: 'USER_MENTION', userMention: { user: { name: 'users/X', displayName: 'X-name' } } },
    ];
    const map = namesFromAnnotations(ann);
    expect(map.size).toBe(1);
    expect(map.get('users/X')).toBe('X-name');
  });

  test('handles missing user/displayName gracefully', () => {
    const ann = [
      { type: 'USER_MENTION', userMention: {} },
      { type: 'USER_MENTION', userMention: { user: { name: 'users/Y' } } }, // no displayName
    ];
    const map = namesFromAnnotations(ann);
    expect(map.get('users/Y')).toBe('');
    expect(map.size).toBe(1);
  });
});

describe('resolveRecipientsFromInput', () => {
  test('combines parsed mentions with annotation-provided names', () => {
    const text = '<users/A> <users/B> <users/C>';
    const ann = [
      { type: 'USER_MENTION', userMention: { user: { name: 'A', displayName: 'Alice' } } },
      { type: 'USER_MENTION', userMention: { user: { name: 'B', displayName: 'Bob' } } },
      // No annotation for C
    ];
    const result = resolveRecipientsFromInput(text, ann);
    expect(result).toEqual([
      { id: 'A', name: 'Alice', email: '' },
      { id: 'B', name: 'Bob', email: '' },
      { id: 'C', name: '', email: '' },
    ]);
  });

  test('returns empty array when text has no mentions', () => {
    expect(resolveRecipientsFromInput('plain text', [])).toEqual([]);
  });

  test('preserves order from text and dedupes', () => {
    const text = '<users/B> <users/A> <users/B>';
    const result = resolveRecipientsFromInput(text, []);
    expect(result.map((r) => r.id)).toEqual(['B', 'A']);
  });
});

describe('userIdFromGoogleUser', () => {
  test('returns empty string for missing user', () => {
    expect(userIdFromGoogleUser(null)).toBe('');
    expect(userIdFromGoogleUser({})).toBe('');
  });

  test('returns name as-is when already prefixed', () => {
    expect(userIdFromGoogleUser({ name: 'users/123' })).toBe('users/123');
  });

  test('prepends users/ when bare id', () => {
    expect(userIdFromGoogleUser({ name: '123' })).toBe('users/123');
  });
});
