const { buildRadarUrl, formatTextBars, probeQuickChart } = require('../../shared/quickchart');
const { escapeHtml } = require('../../shared/sanitize');

function platformLabel(platform) {
  if (platform === 'slack') return ' · slack';
  return '';
}

async function buildLeaderboardCard({
  senderName,
  counts,
  total,
  verbatims = [],
  probe = probeQuickChart,
}) {
  const safeName = escapeHtml(senderName || 'You');
  const widgets = [
    {
      textParagraph: {
        text: `<b>${safeName}</b> has received <b>${total}</b> eyy${total === 1 ? '' : 's'} across the LOKAL values.`,
      },
    },
  ];

  const radarUrl = buildRadarUrl({ counts, label: senderName || 'You' });
  const radarOk = await probe(radarUrl);

  if (radarOk) {
    widgets.push({
      image: {
        imageUrl: radarUrl,
        altText: 'Radar chart of received kudos by LOKAL value',
      },
    });
  } else {
    widgets.push({
      textParagraph: {
        text: `<pre>${escapeHtml(formatTextBars(counts))}</pre>`,
      },
    });
  }

  if (verbatims.length > 0) {
    widgets.push({ divider: {} });
    widgets.push({ textParagraph: { text: '<b>Recent eyys you\'ve received</b>' } });
    for (const v of verbatims) {
      const sender = escapeHtml(v.sender_name || 'Someone');
      const message = escapeHtml(v.message || '');
      const emoji = v.value_emoji || '';
      widgets.push({
        textParagraph: {
          text: `${emoji} <i>"${message}"</i> — <b>${sender}</b>${platformLabel(v.platform)}`,
        },
      });
    }
  }

  return {
    text: `EYYY leaderboard for ${senderName || 'you'}: ${total} total eyys received.`,
    cardsV2: [
      {
        cardId: 'eyyyLeaderboard',
        card: {
          header: {
            title: `EYYY leaderboard for ${senderName || 'you'} 🤙`,
            subtitle: 'Your shape of recognition',
            imageType: 'CIRCLE',
          },
          sections: [{ widgets }],
        },
      },
    ],
  };
}

function buildLeaderboardResponse({ message }) {
  // Google Chat slash-command response shape for posting a public space message.
  return {
    hostAppDataAction: {
      chatDataAction: {
        createMessageAction: { message },
      },
    },
  };
}

function buildLeaderboardPrivateResponse({ text, viewerUserId }) {
  // Returns a private message visible only to the invoker. Used for the
  // empty-state response so a "no eyys yet" message doesn't post in-channel.
  const message = { text };
  if (viewerUserId) {
    message.privateMessageViewer = { name: viewerUserId };
  }
  return {
    hostAppDataAction: {
      chatDataAction: {
        createMessageAction: { message },
      },
    },
  };
}

function medalGchat(rank) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `<b>${rank}.</b>`;
}

function formatLeaderNameGchat(entry) {
  if (entry.userId && entry.userId.startsWith('users/')) {
    return `<${entry.userId}>`;
  }
  return `<b>${escapeHtml(entry.name || 'Someone')}</b>`;
}

function buildTeamLeaderboardCard({ entries = [], total = 0 }) {
  const widgets = [];

  if (entries.length === 0) {
    widgets.push({
      textParagraph: {
        text: 'No eyys logged yet — be the first to give one with <b>/eyy @teammate</b>!',
      },
    });
  } else {
    widgets.push({
      textParagraph: {
        text: `Top ${entries.length} of ${total} total eyys given so far.`,
      },
    });
    widgets.push({ divider: {} });
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const rank = i + 1;
      const topValue = entry.topValueEmoji
        ? ` · ${entry.topValueEmoji} ${escapeHtml(entry.topValueName)}`
        : '';
      widgets.push({
        textParagraph: {
          text: `${medalGchat(rank)} ${formatLeaderNameGchat(entry)} · <b>${entry.total}</b> eyy${entry.total === 1 ? '' : 's'}${topValue}`,
        },
      });
    }
  }

  return {
    text: entries.length === 0
      ? 'EYYY leaderboard — no eyys yet.'
      : `EYYY leaderboard — top ${entries.length} of ${total} eyys given.`,
    cardsV2: [
      {
        cardId: 'eyyyTeamLeaderboard',
        card: {
          header: {
            title: 'EYYY leaderboard 🤙',
            subtitle: 'Who got hyped the most',
            imageType: 'CIRCLE',
          },
          sections: [{ widgets }],
        },
      },
    ],
  };
}

module.exports = {
  buildLeaderboardCard,
  buildLeaderboardResponse,
  buildLeaderboardPrivateResponse,
  buildTeamLeaderboardCard,
};
