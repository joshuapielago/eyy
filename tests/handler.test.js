const { handleEvent } = require('../src/index');

describe('handleEvent', () => {
  test('slash command returns a dialog card via action.navigations', async () => {
    const event = {
      commonEventObject: { userLocale: 'en', hostApp: 'CHAT', platform: 'WEB' },
      chat: {
        user: { displayName: 'Maria Santos', email: 'maria@lokal.ph' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            annotations: [
              { type: 'USER_MENTION', userMention: { user: { displayName: 'Juan Dela Cruz' } } },
            ],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    expect(result.action.navigations).toBeDefined();
    expect(result.action.navigations[0].pushCard).toBeDefined();
    expect(result.action.navigations[0].pushCard.sections[0].widgets.length).toBeGreaterThan(0);
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
    const widgets = result.action.navigations[0].pushCard.sections[0].widgets;
    const recipientWidget = widgets.find(w => w.textInput && w.textInput.name === 'recipient');
    expect(recipientWidget.textInput.value).toBe('Kyla Mendia');
  });

  test('button click with form inputs triggers submit handler', async () => {
    const event = {
      commonEventObject: {
        hostApp: 'CHAT',
        formInputs: {
          recipient: { stringInputs: { value: ['Kyla Mendia'] } },
          message: { stringInputs: { value: ['Amazing work!'] } },
          valueKey: { stringInputs: { value: ['speed'] } },
        },
      },
      chat: {
        user: { displayName: 'Joshua Pielago', email: 'jp@lokal.ph' },
        buttonClickedPayload: {},
      },
    };

    const result = await handleEvent(event);
    expect(result.hostAppDataAction).toBeDefined();
    expect(result.hostAppDataAction.chatDataAction.createMessageAction.message).toBeDefined();
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
  });
});
