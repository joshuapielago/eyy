const { buildDialog } = require('../src/dialog');

describe('buildDialog', () => {
  test('returns a valid dialog action response', () => {
    const result = buildDialog({ recipientName: 'Juan Dela Cruz' });
    expect(result.actionResponse.type).toBe('DIALOG');
    const body = result.actionResponse.dialogAction.dialog.body;
    expect(body.sections).toBeDefined();
    expect(body.sections.length).toBeGreaterThan(0);
  });

  test('dialog contains recipient, message, value, and submit widgets', () => {
    const result = buildDialog({ recipientName: 'Juan Dela Cruz' });
    const widgets = result.actionResponse.dialogAction.dialog.body.sections[0].widgets;
    const widgetNames = widgets
      .filter(w => w.textInput || w.selectionInput)
      .map(w => (w.textInput || w.selectionInput).name);
    expect(widgetNames).toContain('recipient');
    expect(widgetNames).toContain('message');
    expect(widgetNames).toContain('valueKey');
  });

  test('pre-fills recipient name when provided', () => {
    const result = buildDialog({ recipientName: 'Juan Dela Cruz' });
    const widgets = result.actionResponse.dialogAction.dialog.body.sections[0].widgets;
    const recipientWidget = widgets.find(w => w.textInput && w.textInput.name === 'recipient');
    expect(recipientWidget.textInput.value).toBe('Juan Dela Cruz');
  });

  test('leaves recipient empty when not provided', () => {
    const result = buildDialog({});
    const widgets = result.actionResponse.dialogAction.dialog.body.sections[0].widgets;
    const recipientWidget = widgets.find(w => w.textInput && w.textInput.name === 'recipient');
    expect(recipientWidget.textInput.value).toBe('');
  });

  test('value dropdown has all 7 LOKAL values', () => {
    const result = buildDialog({});
    const widgets = result.actionResponse.dialogAction.dialog.body.sections[0].widgets;
    const valueWidget = widgets.find(w => w.selectionInput && w.selectionInput.name === 'valueKey');
    expect(valueWidget.selectionInput.items).toHaveLength(7);
  });
});
