jest.mock('../../src/shared/db', () => ({
  saveKudos: jest.fn().mockResolvedValue({ id: 1 }),
  initDb: jest.fn().mockResolvedValue(),
  pool: { end: jest.fn() },
}));
jest.mock('../../src/shared/giphy', () => ({
  fetchRandomGif: jest.fn().mockResolvedValue('https://giphy.com/x.gif'),
}));

const { recordKudos } = require('../../src/shared/kudos');
const { saveKudos } = require('../../src/shared/db');
const { fetchRandomGif } = require('../../src/shared/giphy');

describe('recordKudos', () => {
  beforeEach(() => jest.clearAllMocks());

  test('writes the row with the platform tag and resolved gif', async () => {
    const result = await recordKudos({
      platform: 'slack',
      sender: { id: 'U1', name: 'Sender', email: 's@x.com' },
      recipient: { id: 'U2', name: 'Recipient', email: 'r@x.com' },
      message: 'great work',
      valueKey: 'speed',
      channel: 'C123',
    });

    expect(result.gifUrl).toBe('https://giphy.com/x.gif');
    expect(result.valueKey).toBe('speed');
    expect(saveKudos).toHaveBeenCalledWith(expect.objectContaining({
      platform: 'slack',
      senderEmail: 's@x.com',
      senderName: 'Sender',
      recipientEmail: 'r@x.com',
      recipientName: 'Recipient',
      recipientUserId: 'U2',
      message: 'great work',
      valueKey: 'speed',
      gifUrl: 'https://giphy.com/x.gif',
      spaceName: 'C123',
    }));
  });

  test('falls back to the default value when valueKey is unknown', async () => {
    const result = await recordKudos({
      platform: 'google-chat',
      sender: { name: 'A' },
      recipient: { id: 'r', name: 'B' },
      message: 'm',
      valueKey: 'no_such_key',
      channel: 'spaces/X',
    });
    expect(result.valueKey).toBe('speed');
    expect(saveKudos).toHaveBeenCalledWith(expect.objectContaining({ valueKey: 'speed' }));
  });

  test('still resolves when saveKudos throws', async () => {
    saveKudos.mockRejectedValueOnce(new Error('db down'));
    const result = await recordKudos({
      platform: 'slack',
      sender: { name: 'A' },
      recipient: { id: 'r', name: 'B' },
      message: 'm',
      valueKey: 'speed',
      channel: 'C',
    });
    expect(result.gifUrl).toBe('https://giphy.com/x.gif');
  });

  test('still resolves when Giphy returns null', async () => {
    fetchRandomGif.mockResolvedValueOnce(null);
    const result = await recordKudos({
      platform: 'slack',
      sender: { name: 'A' },
      recipient: { id: 'r', name: 'B' },
      message: 'm',
      valueKey: 'speed',
      channel: 'C',
    });
    expect(result.gifUrl).toBeNull();
    expect(saveKudos).toHaveBeenCalledWith(expect.objectContaining({ gifUrl: null }));
  });
});
