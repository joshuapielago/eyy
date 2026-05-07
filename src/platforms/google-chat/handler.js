const { buildEyyyCard } = require('./card');
const { buildRenderActionsDialog } = require('./dialog');
const {
  buildLeaderboardCard,
  buildLeaderboardResponse,
  buildLeaderboardPrivateResponse,
  buildTeamLeaderboardCard,
} = require('./leaderboard');
const {
  parseUserMentions,
  namesFromAnnotations,
  resolveRecipientsFromInput,
  userIdFromGoogleUser,
} = require('./identity');
const { getValueByKey } = require('../../shared/values');
const { recordKudosBatch, DEFAULT_VALUE_KEY } = require('../../shared/kudos');
const { parseSlashCommand, GCHAT_MENTION_REGEX } = require('../../shared/commands');
const {
  getReceivedStats,
  getRecentVerbatims,
  getTeamLeaderboard,
} = require('../../shared/stats');
const { learnFromParticipant } = require('../../shared/identity');

function handleEventFactory({ submitUrl }) {
  async function handleEvent(rawEvent) {
    const chat = rawEvent.chat || {};
    const payload = chat.appCommandPayload || {};
    const message = payload.message || {};

    const isSlashCommand = !!message.slashCommand
      || payload.dialogEventType === 'REQUEST_DIALOG';

    if (isSlashCommand) {
      const annotations = message.annotations || [];
      const argumentText = message.argumentText || '';
      const parsed = parseSlashCommand(argumentText, {
        mentionRegex: GCHAT_MENTION_REGEX,
        extractAll: true,
      });

      if (parsed.kind === 'leaderboard') {
        return handleTeamLeaderboard(rawEvent);
      }

      if (parsed.kind === 'me') {
        return handleLeaderboard(rawEvent);
      }

      // Build prefill data from the slash-command annotations + parsed text.
      const namesMap = namesFromAnnotations(annotations);
      const recipientUserIds = parsed.recipientIds.map((id) =>
        id.startsWith('users/') ? id : `users/${id}`
      );
      const recipientNames = recipientUserIds.map((id) => namesMap.get(id) || '');

      return buildRenderActionsDialog({
        submitUrl,
        recipientUserIds,
        recipientNames,
        prefilledMessage: parsed.message,
      });
    }

    if (chat.type === 'ADDED_TO_SPACE') {
      return {
        text: "EYYY! 🤙 I'm here to help you hype up your teammates!\n\nUse `/eyy @someone` to give an eyyy to a coworker, or `/eyy leaderboard` to see your stats.",
      };
    }

    if (chat.buttonClickedPayload || payload.dialogEventType === 'SUBMIT_DIALOG') {
      return handleSubmit(rawEvent);
    }

    return { text: 'Use `/eyy @someone` to give an eyyy! 🤙' };
  }

  return handleEvent;
}

async function handleSubmit(rawEvent) {
  const chat = rawEvent.chat || {};
  const commonEvent = rawEvent.commonEventObject || {};

  const formInputs = commonEvent.formInputs || {};
  const getInput = (name) => formInputs[name]?.stringInputs?.value?.[0] || '';

  const recipientText = getInput('recipient') || '';
  const message = getInput('message') || '';
  const rawValueKey = getInput('valueKey') || DEFAULT_VALUE_KEY;
  const valueKey = getValueByKey(rawValueKey) ? rawValueKey : DEFAULT_VALUE_KEY;

  const params = commonEvent.parameters || {};
  const paramRecipientIds = (params.recipientUserIds || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const paramRecipientNames = (params.recipientNames || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Recipient resolution priority: any <users/N> tokens in the form input,
  // else fall back to slash-command params.
  let recipients;
  const formMentionIds = parseUserMentions(recipientText);
  if (formMentionIds.length > 0) {
    recipients = formMentionIds.map((id, i) => ({
      id: id.startsWith('users/') ? id : `users/${id}`,
      name: paramRecipientNames[i] || '',
      email: '',
    }));
  } else if (paramRecipientIds.length > 0) {
    recipients = paramRecipientIds.map((id, i) => ({
      id: id.startsWith('users/') ? id : `users/${id}`,
      name: paramRecipientNames[i] || '',
      email: '',
    }));
  } else {
    // Last-ditch: treat recipient text as a free-text name. Single recipient,
    // no user_id. Mirrors the previous behavior so existing flows still work.
    recipients = [{ id: '', name: recipientText.trim() || 'Someone', email: '' }];
  }

  const user = chat.user || {};
  const senderName = user.displayName || 'Someone';
  const senderEmail = user.email || '';
  const senderId = userIdFromGoogleUser(user);

  const buttonPayload = chat.buttonClickedPayload || {};
  const spaceName = buttonPayload.message?.space?.name || '';

  const { gifUrl } = await recordKudosBatch({
    platform: 'google-chat',
    sender: { id: senderId, name: senderName, email: senderEmail },
    recipients,
    message,
    valueKey,
    channel: spaceName,
  });

  const card = buildEyyyCard({
    senderName,
    recipients,
    message,
    valueKey,
    gifUrl,
  });

  return {
    hostAppDataAction: {
      chatDataAction: {
        createMessageAction: {
          message: card,
        },
      },
    },
  };
}

async function handleLeaderboard(rawEvent) {
  const chat = rawEvent.chat || {};
  const user = chat.user || {};
  const userId = userIdFromGoogleUser(user);
  const userName = user.displayName || 'You';
  const userEmail = user.email || '';

  // Capture the (email ↔ google_user_id) link from the invoker's event payload.
  // This is the lowest-cost moment to learn it — no API call needed.
  await learnFromParticipant('google-chat', { id: userId, email: userEmail, name: userName });

  let stats;
  try {
    stats = await getReceivedStats({ email: userEmail, userId });
  } catch (err) {
    console.error('[google-chat] getReceivedStats failed:', err.message);
    return buildLeaderboardPrivateResponse({
      text: "Couldn't load your stats — try again in a moment.",
      viewerUserId: userId,
    });
  }

  // Verbatims are best-effort. A non-critical recent-quotes failure must
  // not block the (already-loaded) chart — same shape as Slack.
  const verbatims = await getRecentVerbatims({ email: userEmail, userId }, 5)
    .catch((err) => {
      console.error('[google-chat] getRecentVerbatims failed:', err.message);
      return [];
    });

  if (stats.total === 0) {
    return buildLeaderboardPrivateResponse({
      text: `No eyys received yet, ${userName} — keep being awesome 🤙`,
      viewerUserId: userId,
    });
  }

  const card = await buildLeaderboardCard({
    senderName: userName,
    counts: stats.counts,
    total: stats.total,
    verbatims,
  });

  return buildLeaderboardResponse({ message: card });
}

async function handleTeamLeaderboard(rawEvent) {
  const chat = rawEvent.chat || {};
  const user = chat.user || {};
  const userId = userIdFromGoogleUser(user);

  await learnFromParticipant('google-chat', {
    id: userId,
    email: user.email || '',
    name: user.displayName || '',
  });

  let entries;
  try {
    entries = await getTeamLeaderboard({ limit: 10 });
  } catch (err) {
    console.error('[google-chat] getTeamLeaderboard failed:', err.message);
    return buildLeaderboardPrivateResponse({
      text: "Couldn't load the team leaderboard — try again in a moment.",
      viewerUserId: userId,
    });
  }

  const total = entries.reduce((acc, e) => acc + e.total, 0);
  const card = buildTeamLeaderboardCard({ entries, total });

  return buildLeaderboardResponse({ message: card });
}

module.exports = {
  handleEventFactory,
  handleSubmit,
  handleLeaderboard,
  handleTeamLeaderboard,
};
