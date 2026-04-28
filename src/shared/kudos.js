const { getValueByKey, getRandomGiphyTerm } = require('./values');
const { fetchRandomGif } = require('./giphy');
const { saveKudos } = require('./db');

const DEFAULT_VALUE_KEY = 'speed';

async function recordKudos({
  platform,
  sender,
  recipient,
  message,
  valueKey,
  channel,
}) {
  const resolvedValueKey = getValueByKey(valueKey) ? valueKey : DEFAULT_VALUE_KEY;
  const valueDef = getValueByKey(resolvedValueKey);

  const searchTerm = getRandomGiphyTerm(resolvedValueKey);
  const gifUrl = searchTerm ? await fetchRandomGif(searchTerm) : null;

  try {
    await saveKudos({
      platform,
      senderEmail: sender?.email || '',
      senderName: sender?.name || 'Someone',
      recipientEmail: recipient?.email || '',
      recipientName: recipient?.name || 'Someone',
      recipientUserId: recipient?.id || '',
      message: message || '',
      valueKey: resolvedValueKey,
      gifUrl,
      spaceName: channel || '',
    });
  } catch (err) {
    console.error('Failed to save kudos:', err.message);
  }

  return { valueKey: resolvedValueKey, valueDef, gifUrl };
}

module.exports = { recordKudos, DEFAULT_VALUE_KEY };
