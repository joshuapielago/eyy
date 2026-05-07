const { buildRadarUrl, formatTextBars, probeQuickChart } = require('../../shared/quickchart');
const { escapeSlackMrkdwn } = require('../../shared/sanitize');

function platformBadge(platform) {
  if (platform === 'slack') return ':slack:';
  if (platform === 'google-chat') return ':speech_balloon:';
  return '';
}

function formatVerbatim(v) {
  const sender = escapeSlackMrkdwn(v.sender_name || 'Someone');
  const message = escapeSlackMrkdwn(v.message || '');
  const emoji = v.value_emoji || '';
  return `${emoji} _"${message}"_ — *${sender}*`;
}

async function buildLeaderboard({
  senderName,
  counts,
  total,
  verbatims = [],
  probe = probeQuickChart,
}) {
  const safeName = escapeSlackMrkdwn(senderName || 'You');
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `EYYY leaderboard for ${senderName || 'you'} 🤙`, emoji: true },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `*${safeName}* has received *${total}* eyy${total === 1 ? '' : 's'} across the LOKAL values.`,
        },
      ],
    },
  ];

  const radarUrl = buildRadarUrl({ counts, label: senderName || 'You' });
  const radarOk = await probe(radarUrl);

  if (radarOk) {
    blocks.push({
      type: 'image',
      image_url: radarUrl,
      alt_text: 'Radar chart of received kudos by LOKAL value',
    });
  } else {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '```\n' + formatTextBars(counts) + '\n```' },
    });
  }

  if (verbatims.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Recent eyys you've received*` },
    });
    for (const v of verbatims) {
      blocks.push({
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: formatVerbatim(v) + ` ${platformBadge(v.platform)}` },
        ],
      });
    }
  }

  const fallback = `EYYY leaderboard for ${senderName || 'you'}: ${total} total eyys received.`;
  return { text: fallback, blocks };
}

function buildEmptyLeaderboardEphemeral(senderName) {
  return {
    response_type: 'ephemeral',
    text: `No eyys received yet, ${senderName || 'you'} — keep being awesome 🤙`,
  };
}

module.exports = {
  buildLeaderboard,
  buildEmptyLeaderboardEphemeral,
  formatVerbatim,
};
