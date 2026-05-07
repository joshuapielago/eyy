const { randomUUID } = require('crypto');
const { getValueByKey, getRandomGiphyTerm } = require('./values');
const { fetchRandomGif } = require('./giphy');
const { saveKudos, saveKudosBatch } = require('./db');
const { learnFromParticipant } = require('./identity');

const DEFAULT_VALUE_KEY = 'speed';

async function learnAll(platform, participants) {
  // Best-effort identity learning. Run after the kudos save so a transient
  // identity-store error never silently drops a kudos.
  await Promise.all(
    participants.filter(Boolean).map((p) => learnFromParticipant(platform, p))
  );
}

async function recordKudos({ platform, sender, recipient, message, valueKey, channel }) {
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

  await learnAll(platform, [sender, recipient]);

  return { valueKey: resolvedValueKey, valueDef, gifUrl };
}

async function recordKudosBatch({ platform, sender, recipients, message, valueKey, channel }) {
  const resolvedValueKey = getValueByKey(valueKey) ? valueKey : DEFAULT_VALUE_KEY;
  const valueDef = getValueByKey(resolvedValueKey);

  const searchTerm = getRandomGiphyTerm(resolvedValueKey);
  const gifUrl = searchTerm ? await fetchRandomGif(searchTerm) : null;

  const groupId = randomUUID();
  const list = Array.isArray(recipients) ? recipients : [];

  try {
    await saveKudosBatch(
      list.map((r) => ({
        platform,
        senderEmail: sender?.email || '',
        senderName: sender?.name || 'Someone',
        recipientEmail: r?.email || '',
        recipientName: r?.name || 'Someone',
        recipientUserId: r?.id || '',
        message: message || '',
        valueKey: resolvedValueKey,
        gifUrl,
        spaceName: channel || '',
      })),
      { kudosGroupId: groupId }
    );
  } catch (err) {
    console.error('Failed to save kudos batch:', err.message);
  }

  await learnAll(platform, [sender, ...list]);

  return { valueKey: resolvedValueKey, valueDef, gifUrl, groupId };
}

module.exports = { recordKudos, recordKudosBatch, DEFAULT_VALUE_KEY };
