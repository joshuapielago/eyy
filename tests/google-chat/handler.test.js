jest.mock('../../src/shared/db', () => ({
  saveKudos: jest.fn().mockResolvedValue({ id: 1 }),
  saveKudosBatch: jest.fn().mockResolvedValue([{ id: 1 }]),
  initDb: jest.fn().mockResolvedValue(),
  pool: { end: jest.fn(), query: jest.fn() },
}));

jest.mock('../../src/shared/giphy', () => ({
  fetchRandomGif: jest.fn().mockResolvedValue('https://giphy.com/mock.gif'),
}));

jest.mock('../../src/shared/stats', () => ({
  getReceivedStats: jest.fn(),
  getRecentVerbatims: jest.fn(),
  getTeamLeaderboard: jest.fn(),
}));

jest.mock('../../src/shared/quickchart', () => {
  const actual = jest.requireActual('../../src/shared/quickchart');
  return {
    ...actual,
    probeQuickChart: jest.fn().mockResolvedValue(true),
  };
});

const { handleEventFactory } = require('../../src/platforms/google-chat/handler');
const { saveKudosBatch } = require('../../src/shared/db');
const { fetchRandomGif } = require('../../src/shared/giphy');
const {
  getReceivedStats,
  getRecentVerbatims,
  getTeamLeaderboard,
} = require('../../src/shared/stats');

const handleEvent = handleEventFactory({ submitUrl: 'https://example.test/google-chat' });

describe('google-chat handleEvent — slash command (kudos)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('slash command returns a dialog card via action.navigations', async () => {
    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Maria Santos', email: 'maria@lokal.ph' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: '<users/123>',
            annotations: [
              { type: 'USER_MENTION', userMention: { user: { name: 'users/123', displayName: 'Juan Dela Cruz' } } },
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
            argumentText: '<users/999>',
            annotations: [
              { type: 'USER_MENTION', userMention: { user: { name: 'users/999', displayName: 'Kyla Mendia' } } },
            ],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    const widgets = result.action.navigations[0].pushCard.sections[0].widgets;
    const recipientWidget = widgets.find((w) => w.textInput && w.textInput.name === 'recipient');
    expect(recipientWidget.textInput.value).toBe('Kyla Mendia');
  });

  test('pre-fills message field from slash command text', async () => {
    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Maria' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: '<users/123> thanks for the demo',
            annotations: [
              { type: 'USER_MENTION', userMention: { user: { name: 'users/123', displayName: 'Kyla' } } },
            ],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    const widgets = result.action.navigations[0].pushCard.sections[0].widgets;
    const messageWidget = widgets.find((w) => w.textInput && w.textInput.name === 'message');
    expect(messageWidget.textInput.value).toBe('thanks for the demo');
  });

  test('handles multiple mentioned users in slash command', async () => {
    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Maria' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: '<users/A> <users/B> team win',
            annotations: [
              { type: 'USER_MENTION', userMention: { user: { name: 'users/A', displayName: 'Alice' } } },
              { type: 'USER_MENTION', userMention: { user: { name: 'users/B', displayName: 'Bob' } } },
            ],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    const widgets = result.action.navigations[0].pushCard.sections[0].widgets;
    const recipientWidget = widgets.find((w) => w.textInput && w.textInput.name === 'recipient');
    expect(recipientWidget.textInput.value).toContain('Alice');
    expect(recipientWidget.textInput.value).toContain('Bob');
    const messageWidget = widgets.find((w) => w.textInput && w.textInput.name === 'message');
    expect(messageWidget.textInput.value).toBe('team win');
  });
});

describe('google-chat handleEvent — /eyy leaderboard (team view)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('routes "leaderboard" to a public team leaderboard card', async () => {
    getTeamLeaderboard.mockResolvedValue([
      { identityKey: 'a', name: 'Alice', userId: 'users/A', email: 'a@x.com', total: 10, topValueEmoji: '💛', topValueName: 'Kind by Default', topValueKey: 'kind' },
      { identityKey: 'b', name: 'Bob', userId: 'users/B', email: 'b@x.com', total: 5, topValueEmoji: '⚡', topValueName: 'Speed Is Our Advantage', topValueKey: 'speed' },
    ]);

    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Daisy', email: 'd@x.com', name: 'users/D1' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: 'leaderboard',
            annotations: [],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    const msg = result.hostAppDataAction.chatDataAction.createMessageAction.message;
    expect(msg.privateMessageViewer).toBeUndefined();
    expect(msg.cardsV2[0].card.header.title).toMatch(/leaderboard/i);
    const widgetText = JSON.stringify(msg.cardsV2[0].card.sections);
    // Google Chat <users/N> tokens render as @display name natively, so
    // the mention IDs (not the literal display names) appear in the card.
    expect(widgetText).toContain('users/A');
    expect(widgetText).toContain('users/B');
    expect(widgetText).toContain('Kind by Default');
  });

  test('empty team leaderboard → friendly empty state, still public', async () => {
    getTeamLeaderboard.mockResolvedValue([]);

    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Daisy', email: 'd@x.com', name: 'users/D1' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: 'leaderboard',
            annotations: [],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    const msg = result.hostAppDataAction.chatDataAction.createMessageAction.message;
    expect(msg.privateMessageViewer).toBeUndefined();
    const widgetText = JSON.stringify(msg.cardsV2[0].card.sections);
    expect(widgetText).toMatch(/No eyys logged yet/i);
  });

  test('case-insensitive routing', async () => {
    getTeamLeaderboard.mockResolvedValue([]);

    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Daisy', email: 'd@x.com' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: '  Leaderboard  ',
            annotations: [],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    expect(result.hostAppDataAction).toBeDefined();
    expect(getTeamLeaderboard).toHaveBeenCalled();
  });

  test('team leaderboard query failure → private error to invoker', async () => {
    getTeamLeaderboard.mockRejectedValue(new Error('connection refused'));

    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Daisy', email: 'd@x.com', name: 'users/D1' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: 'leaderboard',
            annotations: [],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    const msg = result.hostAppDataAction.chatDataAction.createMessageAction.message;
    expect(msg.text).toMatch(/couldn't load/i);
    expect(msg.privateMessageViewer).toEqual({ name: 'users/D1' });
  });
});

describe('google-chat handleEvent — /eyy me (personal radar)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('routes "me" to a personal radar response (private when zero)', async () => {
    getReceivedStats.mockResolvedValue({
      counts: emptyCounts(),
      total: 0,
    });
    getRecentVerbatims.mockResolvedValue([]);

    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Daisy', email: 'd@x.com', name: 'users/D1' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: 'me',
            annotations: [],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    const msg = result.hostAppDataAction.chatDataAction.createMessageAction.message;
    expect(msg.text).toMatch(/no eyys/i);
    expect(msg.privateMessageViewer).toEqual({ name: 'users/D1' });
  });

  test('routes "me" to a public personal radar when stats exist', async () => {
    getReceivedStats.mockResolvedValue({
      counts: { speed: 3, talent: 0, kind: 5, hightech: 0, creative: 1, clear: 0, lead: 2 },
      total: 11,
    });
    getRecentVerbatims.mockResolvedValue([
      { sender_name: 'A', message: 'm', value_key: 'kind', value_emoji: '💛', platform: 'slack' },
    ]);

    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Daisy', email: 'd@x.com', name: 'users/D1' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: 'me',
            annotations: [],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    const msg = result.hostAppDataAction.chatDataAction.createMessageAction.message;
    expect(msg.privateMessageViewer).toBeUndefined();
    expect(msg.cardsV2[0].card.header.title).toContain('Daisy');
  });

  test('"stats" alias also routes to personal radar', async () => {
    getReceivedStats.mockResolvedValue({ counts: emptyCounts(), total: 0 });
    getRecentVerbatims.mockResolvedValue([]);

    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Daisy', email: 'd@x.com' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: 'stats',
            annotations: [],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    expect(result.hostAppDataAction).toBeDefined();
    expect(getReceivedStats).toHaveBeenCalled();
  });

  test('stats query failure → private "Couldn\'t load" message, NOT empty state', async () => {
    getReceivedStats.mockRejectedValue(new Error('connection refused'));
    getRecentVerbatims.mockResolvedValue([]);

    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Daisy', email: 'd@x.com', name: 'users/D1' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: 'me',
            annotations: [],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    const msg = result.hostAppDataAction.chatDataAction.createMessageAction.message;
    expect(msg.text).toMatch(/couldn't load your stats/i);
    expect(msg.text).not.toMatch(/keep being awesome/i);
    expect(msg.privateMessageViewer).toEqual({ name: 'users/D1' });
  });

  test('verbatims-only failure does NOT block the leaderboard chart', async () => {
    // Critical: a non-critical recent-quotes failure must not tank the
    // whole response when stats already loaded successfully.
    getReceivedStats.mockResolvedValue({
      counts: { speed: 3, talent: 0, kind: 5, hightech: 0, creative: 1, clear: 0, lead: 2 },
      total: 11,
    });
    getRecentVerbatims.mockRejectedValue(new Error('verbatims blew up'));

    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Daisy', email: 'd@x.com', name: 'users/D1' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: 'me',
            annotations: [],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    const msg = result.hostAppDataAction.chatDataAction.createMessageAction.message;
    // Should be the public chart, NOT the private error.
    expect(msg.privateMessageViewer).toBeUndefined();
    expect(msg.cardsV2).toBeDefined();
    expect(msg.cardsV2[0].card.header.title).toContain('Daisy');
  });

  test('queries by user_id when email missing', async () => {
    getReceivedStats.mockResolvedValue({ counts: emptyCounts(), total: 0 });
    getRecentVerbatims.mockResolvedValue([]);

    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        user: { displayName: 'Daisy', name: 'users/X' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: 'me',
            annotations: [],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    await handleEvent(event);
    expect(getReceivedStats).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'users/X', email: '' })
    );
  });
});

describe('google-chat handleEvent — submit (single recipient legacy)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
        parameters: {
          recipientUserIds: 'users/12345',
          recipientNames: 'Kyla Mendia',
        },
      },
      chat: {
        user: { displayName: 'Joshua Pielago', email: 'jp@lokal.ph' },
        buttonClickedPayload: {
          message: { space: { name: 'spaces/ABC' } },
        },
      },
    };

    const result = await handleEvent(event);

    expect(result.hostAppDataAction).toBeDefined();
    expect(result.hostAppDataAction.chatDataAction.createMessageAction.message).toBeDefined();
    expect(saveKudosBatch).toHaveBeenCalledTimes(1);
    const [rows] = saveKudosBatch.mock.calls[0];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      platform: 'google-chat',
      senderEmail: 'jp@lokal.ph',
      senderName: 'Joshua Pielago',
      recipientName: 'Kyla Mendia',
      recipientUserId: 'users/12345',
      message: 'Amazing work!',
      valueKey: 'speed',
      gifUrl: 'https://giphy.com/mock.gif',
      spaceName: 'spaces/ABC',
    }));
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
    const [rows] = saveKudosBatch.mock.calls[0];
    expect(rows[0]).toEqual(expect.objectContaining({ valueKey: 'speed' }));
  });
});

describe('google-chat handleEvent — submit (multi-recipient)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('saves N rows with shared group_id when form contains multiple <users/N> tokens', async () => {
    const event = {
      commonEventObject: {
        hostApp: 'CHAT',
        formInputs: {
          recipient: { stringInputs: { value: ['<users/A> <users/B> <users/C>'] } },
          message: { stringInputs: { value: ['team win'] } },
          valueKey: { stringInputs: { value: ['kind'] } },
        },
        parameters: {
          recipientUserIds: 'users/A,users/B,users/C',
          recipientNames: 'Alice,Bob,Carol',
        },
      },
      chat: {
        user: { displayName: 'Manager', email: 'm@lokal.ph' },
        buttonClickedPayload: { message: { space: { name: 'spaces/X' } } },
      },
    };

    await handleEvent(event);
    expect(saveKudosBatch).toHaveBeenCalledTimes(1);
    const [rows, opts] = saveKudosBatch.mock.calls[0];
    expect(rows).toHaveLength(3);
    expect(opts.kudosGroupId).toMatch(/^[0-9a-f]{8}-/);
    expect(rows.map((r) => r.recipientUserId)).toEqual(['users/A', 'users/B', 'users/C']);
    rows.forEach((r) => expect(r.platform).toBe('google-chat'));
  });

  test('falls back to params when form text has no mentions', async () => {
    const event = {
      commonEventObject: {
        hostApp: 'CHAT',
        formInputs: {
          recipient: { stringInputs: { value: ['Alice, Bob'] } },
          message: { stringInputs: { value: ['gj'] } },
          valueKey: { stringInputs: { value: ['speed'] } },
        },
        parameters: {
          recipientUserIds: 'users/A,users/B',
          recipientNames: 'Alice,Bob',
        },
      },
      chat: {
        user: { displayName: 'Sender', email: 's@x.com' },
        buttonClickedPayload: {},
      },
    };

    await handleEvent(event);
    const [rows] = saveKudosBatch.mock.calls[0];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.recipientUserId)).toEqual(['users/A', 'users/B']);
  });

  test('renders combined card with multi-recipient message', async () => {
    const event = {
      commonEventObject: {
        hostApp: 'CHAT',
        formInputs: {
          recipient: { stringInputs: { value: ['<users/A> <users/B>'] } },
          message: { stringInputs: { value: ['gj'] } },
          valueKey: { stringInputs: { value: ['kind'] } },
        },
        parameters: {
          recipientUserIds: 'users/A,users/B',
          recipientNames: 'Alice,Bob',
        },
      },
      chat: {
        user: { displayName: 'Manager', email: 'm@x.com' },
        buttonClickedPayload: {},
      },
    };

    const result = await handleEvent(event);
    const message = result.hostAppDataAction.chatDataAction.createMessageAction.message;
    const widgetText = JSON.stringify(message.cardsV2[0].card.sections);
    expect(widgetText).toContain('users/A');
    expect(widgetText).toContain('users/B');
    expect(widgetText).toContain('gave eyyys to');
  });
});

describe('google-chat handleEvent — ADDED_TO_SPACE', () => {
  test('without slash command returns welcome message that mentions leaderboard', async () => {
    const event = {
      chat: {
        type: 'ADDED_TO_SPACE',
        user: { displayName: 'Maria Santos' },
      },
    };

    const result = await handleEvent(event);
    expect(result.text).toContain('EYYY');
    expect(result.text).toMatch(/leaderboard/i);
  });

  test('with slash command opens dialog (auto-install priority)', async () => {
    const event = {
      commonEventObject: { hostApp: 'CHAT' },
      chat: {
        type: 'ADDED_TO_SPACE',
        user: { displayName: 'Maria Santos' },
        appCommandPayload: {
          message: {
            slashCommand: { commandId: 1 },
            argumentText: '<users/123>',
            annotations: [
              { type: 'USER_MENTION', userMention: { user: { name: 'users/123', displayName: 'Chip Lopez' } } },
            ],
          },
          dialogEventType: 'REQUEST_DIALOG',
        },
      },
    };

    const result = await handleEvent(event);
    expect(result.action.navigations).toBeDefined();
    expect(result.text).toBeUndefined();
  });
});

function emptyCounts() {
  return { speed: 0, talent: 0, kind: 0, hightech: 0, creative: 0, clear: 0, lead: 0 };
}
