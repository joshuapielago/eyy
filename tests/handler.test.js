const { handleEvent } = require('../src/index');

describe('handleEvent', () => {
  test('slash command returns a dialog (HTTP endpoint format)', async () => {
    const event = {
      dialogEventType: 'REQUEST_DIALOG',
      isDialogEvent: true,
      message: {
        slashCommand: { commandId: 1 },
        argumentText: ' @Juan Dela Cruz',
        annotations: [
          { type: 'SLASH_COMMAND', startIndex: 0, length: 4 },
          { type: 'USER_MENTION', userMention: { user: { displayName: 'Juan Dela Cruz', email: 'juan@lokal.ph' } } },
        ],
      },
      user: { displayName: 'Maria Santos', email: 'maria@lokal.ph' },
      space: { name: 'spaces/test123', displayName: 'General' },
    };

    const result = await handleEvent(event);
    expect(result.actionResponse.type).toBe('DIALOG');
  });

  test('slash command without mention still returns a dialog', async () => {
    const event = {
      dialogEventType: 'REQUEST_DIALOG',
      isDialogEvent: true,
      message: {
        slashCommand: { commandId: 1 },
        argumentText: '',
      },
      user: { displayName: 'Maria Santos', email: 'maria@lokal.ph' },
      space: { name: 'spaces/test123' },
    };

    const result = await handleEvent(event);
    expect(result.actionResponse.type).toBe('DIALOG');
  });

  test('ADDED_TO_SPACE returns welcome message', async () => {
    const event = {
      type: 'ADDED_TO_SPACE',
      user: { displayName: 'Maria Santos' },
      space: { name: 'spaces/test123', displayName: 'General' },
    };

    const result = await handleEvent(event);
    expect(result.text).toContain('EYYY');
    expect(result.text).toContain('🤙');
  });
});
