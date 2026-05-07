const {
  parseSlashCommand,
  SLACK_MENTION_REGEX,
  GCHAT_MENTION_REGEX,
} = require('../../src/shared/commands');

describe('parseSlashCommand — Slack mention syntax', () => {
  const opts = { mentionRegex: SLACK_MENTION_REGEX };

  test('empty input → kudos with no recipient and empty message', () => {
    expect(parseSlashCommand('', opts)).toEqual({
      kind: 'kudos',
      recipientIds: [],
      message: '',
    });
  });

  test('whitespace-only input → kudos with no recipient and empty message', () => {
    expect(parseSlashCommand('   \t  ', opts)).toEqual({
      kind: 'kudos',
      recipientIds: [],
      message: '',
    });
  });

  test('"leaderboard" alone routes to leaderboard', () => {
    expect(parseSlashCommand('leaderboard', opts)).toEqual({ kind: 'leaderboard' });
  });

  test('"Leaderboard" (case-insensitive) routes to leaderboard', () => {
    expect(parseSlashCommand('Leaderboard', opts)).toEqual({ kind: 'leaderboard' });
    expect(parseSlashCommand('LEADERBOARD', opts)).toEqual({ kind: 'leaderboard' });
  });

  test('"leaderboard" with whitespace padding still routes to leaderboard', () => {
    expect(parseSlashCommand('  leaderboard  ', opts)).toEqual({ kind: 'leaderboard' });
  });

  test('"leaderboard share" stays as kudos with the literal text', () => {
    expect(parseSlashCommand('leaderboard share', opts)).toEqual({
      kind: 'kudos',
      recipientIds: [],
      message: 'leaderboard share',
    });
  });

  test('mention at start: extracts recipient and rest as message', () => {
    expect(parseSlashCommand('<@U1|alice> thanks for the demo', opts)).toEqual({
      kind: 'kudos',
      recipientIds: ['U1'],
      message: 'thanks for the demo',
    });
  });

  test('mention at start without pipe (no display name)', () => {
    expect(parseSlashCommand('<@U1> thanks', opts)).toEqual({
      kind: 'kudos',
      recipientIds: ['U1'],
      message: 'thanks',
    });
  });

  test('mention in middle: still extracts and strips', () => {
    expect(parseSlashCommand('thanks <@U1|alice> for the demo', opts)).toEqual({
      kind: 'kudos',
      recipientIds: ['U1'],
      message: 'thanks for the demo',
    });
  });

  test('two mentions: first becomes recipient, second stays in message', () => {
    expect(parseSlashCommand('<@U1|alice> and <@U2|bob> for the demo', opts)).toEqual({
      kind: 'kudos',
      recipientIds: ['U1'],
      message: 'and <@U2|bob> for the demo',
    });
  });

  test('text without mention: empty recipient, full message preserved', () => {
    expect(parseSlashCommand('thanks everyone', opts)).toEqual({
      kind: 'kudos',
      recipientIds: [],
      message: 'thanks everyone',
    });
  });

  test('collapses internal whitespace runs to single spaces', () => {
    expect(parseSlashCommand('<@U1|a>   thanks    for    everything', opts)).toEqual({
      kind: 'kudos',
      recipientIds: ['U1'],
      message: 'thanks for everything',
    });
  });

  test('truncates message at 3000 chars with ellipsis', () => {
    const long = 'a'.repeat(5000);
    const result = parseSlashCommand(`<@U1|a> ${long}`, opts);
    expect(result.kind).toBe('kudos');
    expect(result.recipientIds).toEqual(['U1']);
    expect(result.message.length).toBe(3000);
    expect(result.message.endsWith('…')).toBe(true);
  });

  test('non-leaderboard text starting with "leader" is kudos', () => {
    expect(parseSlashCommand('leader of the pack', opts)).toEqual({
      kind: 'kudos',
      recipientIds: [],
      message: 'leader of the pack',
    });
  });

  test('Workspace user IDs (W prefix) work', () => {
    expect(parseSlashCommand('<@W123ABC> message', opts)).toEqual({
      kind: 'kudos',
      recipientIds: ['W123ABC'],
      message: 'message',
    });
  });
});

describe('parseSlashCommand — Google Chat mention syntax', () => {
  const opts = { mentionRegex: GCHAT_MENTION_REGEX };

  test('users/N mention extracted as recipient', () => {
    expect(parseSlashCommand('<users/123> thanks', opts)).toEqual({
      kind: 'kudos',
      recipientIds: ['123'],
      message: 'thanks',
    });
  });

  test('two users/N mentions: first is recipient, second remains', () => {
    expect(parseSlashCommand('<users/A> and <users/B> for it', opts)).toEqual({
      kind: 'kudos',
      recipientIds: ['A'],
      message: 'and <users/B> for it',
    });
  });

  test('"leaderboard" routes regardless of platform regex', () => {
    expect(parseSlashCommand('leaderboard', opts)).toEqual({ kind: 'leaderboard' });
  });

  test('userIDs with hyphens / mixed alphanumerics', () => {
    expect(parseSlashCommand('<users/abc-123_XYZ> hi', opts)).toEqual({
      kind: 'kudos',
      recipientIds: ['abc-123_XYZ'],
      message: 'hi',
    });
  });
});

describe('parseSlashCommand — extractAllMentions option', () => {
  test('Slack: all mentions returned as recipientIds when extractAll is true', () => {
    const result = parseSlashCommand('<@U1|a> <@U2|b> <@U3|c> good work', {
      mentionRegex: SLACK_MENTION_REGEX,
      extractAll: true,
    });
    expect(result.kind).toBe('kudos');
    expect(result.recipientIds).toEqual(['U1', 'U2', 'U3']);
    expect(result.message).toBe('good work');
  });

  test('Slack: dedups duplicate mentions when extractAll', () => {
    const result = parseSlashCommand('<@U1|a> <@U1|a> <@U2|b>', {
      mentionRegex: SLACK_MENTION_REGEX,
      extractAll: true,
    });
    expect(result.recipientIds).toEqual(['U1', 'U2']);
  });

  test('GChat: all mentions extracted with extractAll', () => {
    const result = parseSlashCommand('<users/A> <users/B> <users/C> nice', {
      mentionRegex: GCHAT_MENTION_REGEX,
      extractAll: true,
    });
    expect(result.recipientIds).toEqual(['A', 'B', 'C']);
    expect(result.message).toBe('nice');
  });
});
