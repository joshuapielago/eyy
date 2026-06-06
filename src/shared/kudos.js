const { randomUUID } = require('crypto');
const { resolveConfig, resolveGifUrl, getValue } = require('./config');
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

async function recordKudos({ platform, sender, recipient, message, valueKey, channel, tenantId, config }) {
  const tenantConfig = config || resolveConfig(tenantId);
  const resolvedValueKey = getValue(tenantConfig, valueKey)
    ? valueKey
    : (tenantConfig.values[0]?.key || DEFAULT_VALUE_KEY);
  const valueDef = getValue(tenantConfig, resolvedValueKey);

  const gifUrl = await resolveGifUrl(tenantConfig, resolvedValueKey);

  // Let save failures propagate: callers must NOT announce a kudos that did
  // not persist (that would show a success card while the DB recorded nothing).
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

  await learnAll(platform, [sender, recipient]);

  return { valueKey: resolvedValueKey, valueDef, gifUrl };
}

async function recordKudosBatch({ platform, sender, recipients, message, valueKey, channel, tenantId, config }) {
  const tenantConfig = config || resolveConfig(tenantId);
  const resolvedValueKey = getValue(tenantConfig, valueKey)
    ? valueKey
    : (tenantConfig.values[0]?.key || DEFAULT_VALUE_KEY);
  const valueDef = getValue(tenantConfig, resolvedValueKey);

  const gifUrl = await resolveGifUrl(tenantConfig, resolvedValueKey);

  const groupId = randomUUID();
  const list = Array.isArray(recipients) ? recipients : [];

  // Let save failures propagate: callers must NOT announce a kudos that did
  // not persist. saveKudosBatch is transactional (all-or-nothing).
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

  await learnAll(platform, [sender, ...list]);

  return { valueKey: resolvedValueKey, valueDef, gifUrl, groupId };
}

module.exports = { recordKudos, recordKudosBatch, DEFAULT_VALUE_KEY };
