const { escapeHtml, escapeSlackMrkdwn } = require('../../src/shared/sanitize');

describe('escapeHtml', () => {
  test('escapes &, <, and >', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert("x")&lt;/script&gt;'
    );
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  test('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  test('coerces non-strings to string', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('escapeSlackMrkdwn', () => {
  test('escapes Slack control characters', () => {
    expect(escapeSlackMrkdwn('a & b')).toBe('a &amp; b');
    expect(escapeSlackMrkdwn('<@U1>')).toBe('&lt;@U1&gt;');
  });

  test('returns empty string for null/undefined', () => {
    expect(escapeSlackMrkdwn(null)).toBe('');
  });
});
