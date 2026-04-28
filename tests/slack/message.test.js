const { buildEyyyBlocks } = require('../../src/platforms/slack/message');

describe('buildEyyyBlocks', () => {
  const base = {
    senderName: 'Maria Santos',
    recipientUserId: 'U222',
    recipientName: 'Juan Dela Cruz',
    message: 'Shipped overnight',
    valueKey: 'speed',
    gifUrl: 'https://giphy.com/x.gif',
  };

  test('uses Slack <@user> mention syntax in fallback text and sender section', () => {
    const result = buildEyyyBlocks(base);
    expect(result.text).toContain('<@U222>');
    const section = result.blocks.find((b) => b.type === 'section' && b.text?.text?.includes('gave an eyyy'));
    expect(section.text.text).toContain('<@U222>');
  });

  test('falls back to plain recipient name when no userId', () => {
    const result = buildEyyyBlocks({ ...base, recipientUserId: '' });
    expect(result.text).toContain('Juan Dela Cruz');
    expect(result.text).not.toContain('<@>');
  });

  test('escapes Slack control characters in user-supplied message', () => {
    const result = buildEyyyBlocks({ ...base, message: 'a < b & c > d' });
    const messageSection = result.blocks.find(
      (b) => b.type === 'section' && b.text?.text?.startsWith('_"')
    );
    expect(messageSection.text.text).toContain('a &lt; b &amp; c &gt; d');
  });

  test('includes value name and tagline in a context block', () => {
    const result = buildEyyyBlocks(base);
    const ctx = result.blocks.find((b) => b.type === 'context');
    expect(ctx.elements[0].text).toContain('Speed Is Our Advantage');
    expect(ctx.elements[0].text).toContain('Move fast, win first');
  });

  test('appends an image block when gifUrl is present', () => {
    const result = buildEyyyBlocks(base);
    const image = result.blocks.find((b) => b.type === 'image');
    expect(image.image_url).toBe('https://giphy.com/x.gif');
  });

  test('omits image block when no gifUrl', () => {
    const result = buildEyyyBlocks({ ...base, gifUrl: null });
    expect(result.blocks.find((b) => b.type === 'image')).toBeUndefined();
  });
});
