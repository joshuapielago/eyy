jest.mock('../src/db', () => ({
  saveKudos: jest.fn().mockResolvedValue({ id: 1 }),
  initDb: jest.fn().mockResolvedValue(),
}));

jest.mock('../src/giphy', () => ({
  fetchRandomGif: jest.fn().mockResolvedValue('https://giphy.com/mock.gif'),
}));

const { handleEvent } = require('../src/index');
const { saveKudos } = require('../src/db');
const { fetchRandomGif } = require('../src/giphy');

describe('handleEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  test('button click with form inputs triggers submit and saves kudos', async () => {
    const event = {
      commonEventObject: {
        hostApp: 'CHAT',
        formInputs: {
          recipient: { stringInputs: { value: ['Kyla Mendia'] } },
          message: { stringInputs: { value: ['Amazing work!'] } },
          valueKey: { stringInputs: { value: ['speed'] } },
        },
        parameters: { recipientUserId: 'users/12345' },
      },
      chat: {
        user: { displayName: 'Joshua Pielago', email: 'jp@lokal.ph' },
        buttonClickedPayload: {
          message: { space: { name: 'spaces/ABC' } },
        },
      },
    };

    const result = await handleEvent(event);

    // Returns a card response
    expect(result.hostAppDataAction).toBeDefined();
    expect(result.hostAppDataAction.chatDataAction.createMessageAction.message).toBeDefined();

    // Saved kudos with correct arguments
    expect(saveKudos).toHaveBeenCalledWith({
      senderEmail: 'jp@lokal.ph',
      senderName: 'Joshua Pielago',
      recipientEmail: '',
      recipientName: 'Kyla Mendia',
      recipientUserId: 'users/12345',
      message: 'Amazing work!',
      valueKey: 'speed',
      gifUrl: 'https://giphy.com/mock.gif',
      spaceName: 'spaces/ABC',
    });

    // Fetched a gif
    expect(fetchRandomGif).toHaveBeenCalled();
  });

  test('submit with invalid valueKey falls back to speed', async () => {
    const event = {
      commonEventObject: {
        hostApp: 'CHAT',
        formInputs: {
          recipient: { stringInputs: { value: ['Test User'] } },
          message: { stringInputs: { value: ['Great!'] } },
          valueKey: { stringInputs: { value: ['nonexistent_value'] } },
        },
      },
      chat: {
        user: { displayName: 'Sender', email: 'sender@lokal.ph' },
        buttonClickedPayload: {},
      },
    };

    const result = await handleEvent(event);
    expect(result.hostAppDataAction).toBeDefined();
    expect(saveKudos).toHaveBeenCalledWith(
      expect.objectContaining({ valueKey: 'speed' })
    );
  });

  test('ADDED_TO_SPACE with slash command opens dialog (auto-install)', async () => {
    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        type: 'ADDED_TO_SPACE',
        user: { displayName: 'Maria Santos' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            annotations: [
              { type: 'USER_MENTION', userMention: { user: { displayName: 'Chip Lopez' } } },
            ],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    // Should open dialog, NOT return welcome text
    expect(result.action.navigations).toBeDefined();
    expect(result.action.navigations[0].pushCard).toBeDefined();
    expect(result.text).toBeUndefined();
  });

  test('ADDED_TO_SPACE without slash command returns welcome message', async () => {
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
