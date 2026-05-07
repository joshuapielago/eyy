const { buildEyyyModal, readModalSubmission, CALLBACK_ID } = require('./modal');
const { buildEyyyBlocks } = require('./message');
const {
  buildLeaderboard,
  buildEmptyLeaderboardEphemeral,
  buildTeamLeaderboard,
} = require('./leaderboard');
const { recordKudosBatch } = require('../../shared/kudos');
const {
  getReceivedStats,
  getRecentVerbatims,
  getTeamLeaderboard,
} = require('../../shared/stats');
const { parseSlashCommand, SLACK_MENTION_REGEX } = require('../../shared/commands');
const { getSlackClient } = require('./client');
const { learnFromParticipant } = require('../../shared/identity');

const SLACK_USER_MENTION_FIRST = /<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/;

function parsePrefilledUser(text) {
  if (!text) return '';
  const match = text.match(SLACK_USER_MENTION_FIRST);
  return match ? match[1] : '';
}

async function lookupSlackUser(userId) {
  if (!userId) return { id: '', name: '', email: '' };
  try {
    const client = getSlackClient();
    const result = await client.users.info({ user: userId });
    const profile = result?.user?.profile || {};
    return {
      id: userId,
      name: profile.real_name || result?.user?.name || '',
      email: profile.email || '',
    };
  } catch (err) {
    console.error('[slack] users.info failed:', err.message);
    return { id: userId, name: '', email: '' };
  }
}

async function handleSlashCommand(body) {
  const triggerId = body.trigger_id;
  const channelId = body.channel_id || '';
  const text = body.text || '';
  const responseUrl = body.response_url || '';
  const userId = body.user_id || '';

  const parsed = parseSlashCommand(text, { mentionRegex: SLACK_MENTION_REGEX });

  if (parsed.kind === 'leaderboard') {
    setImmediate(() => buildAndPostTeamLeaderboard({ channelId, userId, responseUrl }));
    return { ok: true };
  }

  if (parsed.kind === 'me') {
    setImmediate(() => buildAndPostLeaderboard({ channelId, userId, responseUrl }));
    return { ok: true };
  }

  const view = buildEyyyModal({
    channelId,
    prefilledUserIds: parsed.recipientIds,
    prefilledMessage: parsed.message,
  });

  const client = getSlackClient();
  await client.views.open({ trigger_id: triggerId, view });

  return { ok: true };
}

async function buildAndPostLeaderboard({ channelId, userId, responseUrl }) {
  const invoker = await lookupSlackUser(userId);

  // Cheapest place to capture (email ↔ slack_user_id) for someone who only
  // ever invokes /eyy me — no extra API call beyond the one we already made.
  await learnFromParticipant('slack', invoker);

  if (!invoker.email) {
    await sendEphemeral(responseUrl, channelId, userId,
      "Couldn't load your stats — try again in a moment.");
    return;
  }

  let stats;
  try {
    stats = await getReceivedStats(invoker.email);
  } catch (err) {
    console.error('[slack] getReceivedStats failed:', err.message);
    await sendEphemeral(responseUrl, channelId, userId,
      "Couldn't load your stats — try again in a moment.");
    return;
  }

  // Verbatims are best-effort: a missing recent-quotes section is fine,
  // but a stats failure must NOT be silently treated as "zero kudos" —
  // that would show the user a misleading "no eyys yet" empty state.
  const verbatims = await getRecentVerbatims(invoker.email, 5).catch((err) => {
    console.error('[slack] getRecentVerbatims failed:', err.message);
    return [];
  });

  if (stats.total === 0) {
    const ephemeral = buildEmptyLeaderboardEphemeral(invoker.name || 'you');
    await sendEphemeral(responseUrl, channelId, userId, ephemeral.text);
    return;
  }

  const board = await buildLeaderboard({
    senderName: invoker.name || 'You',
    counts: stats.counts,
    total: stats.total,
    verbatims,
  });

  try {
    const client = getSlackClient();
    await client.chat.postMessage({
      channel: channelId,
      text: board.text,
      blocks: board.blocks,
    });
  } catch (err) {
    console.error('[slack] leaderboard chat.postMessage failed:', err.message);
    await sendEphemeral(responseUrl, channelId, userId,
      `Saved your leaderboard but couldn't post here — \`/invite @EYYY\` to this channel.`);
  }
}

async function buildAndPostTeamLeaderboard({ channelId, userId, responseUrl }) {
  let entries;
  try {
    entries = await getTeamLeaderboard({ limit: 10 });
  } catch (err) {
    console.error('[slack] getTeamLeaderboard failed:', err.message);
    await sendEphemeral(responseUrl, channelId, userId,
      "Couldn't load the team leaderboard — try again in a moment.");
    return;
  }

  const total = entries.reduce((acc, e) => acc + e.total, 0);
  const board = buildTeamLeaderboard({ entries, total });

  try {
    const client = getSlackClient();
    await client.chat.postMessage({
      channel: channelId,
      text: board.text,
      blocks: board.blocks,
    });
  } catch (err) {
    console.error('[slack] team leaderboard chat.postMessage failed:', err.message);
    await sendEphemeral(responseUrl, channelId, userId,
      "Couldn't post the leaderboard here — `/invite @EYYY` to this channel.");
  }
}

async function sendEphemeral(responseUrl, channelId, userId, text) {
  if (responseUrl) {
    try {
      const res = await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_type: 'ephemeral', text }),
      });
      if (res.ok) return;
    } catch (err) {
      console.error('[slack] response_url post failed:', err.message);
    }
  }
  try {
    const client = getSlackClient();
    await client.chat.postEphemeral({ channel: channelId, user: userId, text });
  } catch (err) {
    console.error('[slack] chat.postEphemeral failed:', err.message);
  }
}

function emptyCounts() {
  return { speed: 0, talent: 0, kind: 0, hightech: 0, creative: 0, clear: 0, lead: 0 };
}

async function handleViewSubmission(payload) {
  const view = payload.view || {};
  if (view.callback_id !== CALLBACK_ID) {
    return { response_action: 'clear' };
  }

  const { recipientUserIds, message, valueKey, channelId } = readModalSubmission(view);

  if (!recipientUserIds || recipientUserIds.length === 0) {
    return {
      response_action: 'errors',
      errors: { recipient_block: 'Pick at least one teammate.' },
    };
  }

  const senderId = payload.user?.id || '';
  const [sender, ...recipients] = await Promise.all([
    lookupSlackUser(senderId),
    ...recipientUserIds.map(lookupSlackUser),
  ]);

  const { gifUrl, valueKey: resolvedValueKey } = await recordKudosBatch({
    platform: 'slack',
    sender,
    recipients,
    message,
    valueKey,
    channel: channelId,
  });

  setImmediate(async () => {
    try {
      const client = getSlackClient();
      const { text, blocks } = buildEyyyBlocks({
        senderName: sender.name || 'Someone',
        recipients: recipients.map((r) => ({ id: r.id, name: r.name })),
        message,
        valueKey: resolvedValueKey,
        gifUrl,
      });
      await client.chat.postMessage({ channel: channelId, text, blocks });
    } catch (err) {
      console.error('[slack] chat.postMessage failed:', err.message);
    }
  });

  return { response_action: 'clear' };
}

module.exports = {
  handleSlashCommand,
  handleViewSubmission,
  parsePrefilledUser,
  lookupSlackUser,
  buildAndPostLeaderboard,
  buildAndPostTeamLeaderboard,
};
