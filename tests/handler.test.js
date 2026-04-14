const { handleEvent } = require('../src/index');

describe('handleEvent', () => {
  test('slash command returns a dialog (v2 HTTP endpoint format)', async () => {
    const event = {
      commonEventObject: { userLocale: 'en', hostApp: 'CHAT', platform: 'WEB' },
      chat: {
        user: { displayName: 'Maria Santos', email: 'maria@lokal.ph' },
        eventTime: '2026-04-14T00:00:00Z',
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: ' @Juan Dela Cruz',
            annotations: [
              { type: 'SLASH_COMMAND', startIndex: 0, length: 4 },
              { type: 'USER_MENTION', userMention: { user: { displayName: 'Juan Dela Cruz', email: 'juan@lokal.ph' } } },
            ],
          },
          isDialogEvent: true,
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    expect(result.actionResponse.type).toBe('DIALOG');
  });

  test('slash command without mention still returns a dialog', async () => {
    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Maria Santos', email: 'maria@lokal.ph' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: '',
          },
          isDialogEvent: true,
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    expect(result.actionResponse.type).toBe('DIALOG');
  });

  test('pre-fills recipient name from USER_MENTION annotation', async () => {
    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Maria Santos' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            annotations: [
              { type: 'USER_MENTION', userMention: { user: { displayName: 'Kyla Mendia' } } },
            ],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    const widgets = result.actionResponse.dialogAction.dialog.body.sections[0].widgets;
    const recipientWidget = widgets.find(w => w.textInput && w.textInput.name === 'recipient');
    expect(recipientWidget.textInput.value).toBe('Kyla Mendia');
  });

  test('ADDED_TO_SPACE returns welcome message', async () => {
    const event = {
      chat: {
        type: 'ADDED_TO_SPACE',
        user: { displayName: 'Maria Santos' },
      },
    };

    const result = await handleEvent(event);
    expect(result.text).toContain('EYYY');
    expect(result.text).toContain('🤙');
  });
});
