const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

const config = require('../../config');
const { BotSession, interSessionManager } = require('../../src/core/BotSession');
const { getExistingSessions } = require('../../src/modes/pairing');
const { applyConfig } = require('../../src/modes/waConfig');
const { setDiscordLogChannel } = require('../../src/utils/helpers');

// Active bot sessions
const activeSessions = new Map();
let currentMode = null;
let panelMessage = null;
let logChannelId = null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

// ============================================
// HELPERS
// ============================================
function getSessionNames() {
  return getExistingSessions();
}

async function startBots(sessionNames, options = {}) {
  const results = [];
  for (const name of sessionNames) {
    if (activeSessions.has(name)) {
      results.push({ name, status: 'already_running' });
      continue;
    }
    const bot = new BotSession({ name, enabled: true, ...options });
    try {
      await bot.start();
      activeSessions.set(name, bot);
      results.push({ name, status: 'started', botName: bot.botName });
    } catch (e) {
      results.push({ name, status: 'failed', error: e.message });
    }
  }
  return results;
}

function stopBots() {
  for (const [name, bot] of activeSessions) {
    bot.stopIntervals();
    bot.intentionalDisconnect = true;
    try { bot.sock?.end(); } catch (e) {}
  }
  const count = activeSessions.size;
  activeSessions.clear();
  currentMode = null;
  return count;
}

function formatResults(mode, results) {
  let text = '';
  for (const r of results) {
    if (r.status === 'started') text += `✅ ${r.name} (${r.botName})\n`;
    else if (r.status === 'already_running') text += `⚡ ${r.name} (already running)\n`;
    else text += `❌ ${r.name}: ${r.error}\n`;
  }
  return text || 'No results';
}

function parseSessions(args) {
  const existing = getSessionNames();
  if (!args || !args.length || args[0] === 'all') return existing;
  return args[0].split(',').map(s => s.trim()).filter(s => existing.includes(s));
}

// ============================================
// PANEL EMBED
// ============================================
function buildPanelEmbed() {
  const existing = getSessionNames();
  const active = Array.from(activeSessions.keys());

  let sessionList = '';
  for (const name of existing) {
    const credsPath = path.join(process.cwd(), 'sessions', name, 'creds.json');
    let phone = '?';
    try {
      if (fs.existsSync(credsPath)) {
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
        phone = creds.me?.id?.split(':')[0] || '?';
      }
    } catch (e) {}
    const bot = activeSessions.get(name);
    let status = '⚪';
    if (bot?.ready) status = '🟢';
    else if (activeSessions.has(name)) status = '🟡';
    sessionList += `${status} **${name}** (${phone})${bot ? ` — ${bot.botName}` : ''}\n`;
  }

  if (!sessionList) sessionList = '_No sessions_';

  const embed = new EmbedBuilder()
    .setTitle('🤖 WA-WARMER Control Panel')
    .setColor(0x7c3aed)
    .addFields(
      { name: '📊 Status', value: `**Mode:** ${currentMode || 'idle'}\n**Active:** ${active.length}/${existing.length}`, inline: true },
      { name: '🤖 AI Provider', value: config.ai.provider || 'google', inline: true },
      { name: '📋 Sessions', value: sessionList },
    )
    .setFooter({ text: 'Klik button di bawah untuk kontrol bot' })
    .setTimestamp();

  return embed;
}

function buildPanelButtons() {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('join').setLabel('📥 Join Groups').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('chat').setLabel('💬 Chat in Groups').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dm').setLabel('📩 DM Members').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('online').setLabel('🟢 Always Online').setStyle(ButtonStyle.Success),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('waconfig').setLabel('⚙️ WA Config').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('health').setLabel('🏥 Health').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ai').setLabel('🤖 AI Settings').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('exit').setLabel('🛑 Force Stop').setStyle(ButtonStyle.Danger),
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('setlog').setLabel('📝 Set Log Channel').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('refresh').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary),
  );

  return [row1, row2, row3];
}

async function updatePanel(interaction) {
  try {
    if (panelMessage) {
      await panelMessage.edit({ embeds: [buildPanelEmbed()], components: buildPanelButtons() });
    }
  } catch (e) {}
}

// ============================================
// BUTTON HANDLERS
// ============================================
async function handleButton(interaction) {
  const id = interaction.customId;
  const sessions = getSessionNames();

  switch (id) {
    case 'join': {
      if (!sessions.length) return interaction.reply({ content: '❌ No sessions found.', ephemeral: true });
      await interaction.reply({ content: `📥 Starting join mode (${sessions.length} sessions)...`, ephemeral: true });
      stopBots();
      currentMode = 'join';
      const results = await startBots(sessions, { autoJoinGroups: true, autoStartIntervals: false, replyToUsers: false, enableInterSession: false });
      await interaction.followUp({ content: `**Join Groups**\n${formatResults('join', results)}`, ephemeral: true });
      await updatePanel(interaction);
      break;
    }

    case 'chat': {
      if (sessions.length < 2) return interaction.reply({ content: '❌ Minimal 2 sessions untuk chat mode.', ephemeral: true });
      await interaction.reply({ content: `💬 Starting chat mode (${sessions.length} sessions)...`, ephemeral: true });
      stopBots();
      currentMode = 'chat';
      const results = await startBots(sessions, { autoJoinGroups: false, autoStartIntervals: false, replyToUsers: false, enableInterSession: true });
      if (config.interSession?.enabled) {
        interSessionManager.config = config;
        interSessionManager.initialized = true;
      }
      for (const [name, bot] of activeSessions) {
        bot.intervals.push(setInterval(() => bot.aiChatToGroups(), config.intervals.groupChatInterval * 60 * 60 * 1000));
      }
      const firstBot = activeSessions.values().next().value;
      if (firstBot?.ready) setTimeout(() => firstBot.aiChatToGroups(), 10000);
      await interaction.followUp({ content: `**Chat in Groups**\n${formatResults('chat', results)}`, ephemeral: true });
      await updatePanel(interaction);
      break;
    }

    case 'dm': {
      if (!sessions.length) return interaction.reply({ content: '❌ No sessions found.', ephemeral: true });
      await interaction.reply({ content: `📩 Starting DM mode (${sessions.length} sessions)...`, ephemeral: true });
      stopBots();
      currentMode = 'dm';
      const results = await startBots(sessions, { autoJoinGroups: false, autoStartIntervals: false, replyToUsers: false, enableInterSession: false });
      for (const [name, bot] of activeSessions) {
        bot.intervals.push(setInterval(() => bot.dmToGroupMembers(), config.intervals.dmInterval * 60 * 60 * 1000));
        setTimeout(() => bot.dmToGroupMembers(), 5000);
      }
      await interaction.followUp({ content: `**DM Members**\n${formatResults('dm', results)}`, ephemeral: true });
      await updatePanel(interaction);
      break;
    }

    case 'online': {
      if (!sessions.length) return interaction.reply({ content: '❌ No sessions found.', ephemeral: true });
      await interaction.reply({ content: `🟢 Starting always online (${sessions.length} sessions)...`, ephemeral: true });
      stopBots();
      currentMode = 'online';
      const results = await startBots(sessions, { autoJoinGroups: false, autoStartIntervals: false, replyToUsers: true, enableInterSession: false });
      await interaction.followUp({ content: `**Always Online**\n${formatResults('online', results)}`, ephemeral: true });
      await updatePanel(interaction);
      break;
    }

    case 'waconfig': {
      if (!sessions.length) return interaction.reply({ content: '❌ No sessions found.', ephemeral: true });
      await interaction.reply({ content: `⚙️ Configuring ${sessions.length} session(s)...`, ephemeral: true });
      const results = await startBots(sessions, { autoJoinGroups: false, autoStartIntervals: false, replyToUsers: false, enableInterSession: false });
      for (const [name, bot] of activeSessions) {
        try { await applyConfig(bot); } catch (e) {}
      }
      for (const name of sessions) {
        const bot = activeSessions.get(name);
        if (bot) { bot.disconnect(); activeSessions.delete(name); }
      }
      currentMode = null;
      await interaction.followUp({ content: '✅ WA Configuration selesai!', ephemeral: true });
      await updatePanel(interaction);
      break;
    }

    case 'health': {
      let desc = '';
      for (const name of sessions) {
        const credsPath = path.join(process.cwd(), 'sessions', name, 'creds.json');
        const exists = fs.existsSync(credsPath);
        const bot = activeSessions.get(name);
        let status = '❌ No creds';
        if (exists && bot?.ready) status = '🟢 Connected';
        else if (exists && activeSessions.has(name)) status = '🟡 Connecting';
        else if (exists) status = '⚪ Idle';
        desc += `**${name}:** ${status}\n`;
      }
      const embed = new EmbedBuilder().setTitle('🏥 Session Health').setColor(0x3b82f6).setDescription(desc || 'No sessions');
      await interaction.reply({ embeds: [embed], ephemeral: true });
      break;
    }

    case 'ai': {
      const current = config.ai.provider || 'google';
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ai_google').setLabel('🔵 Google').setStyle(current === 'google' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ai_cerebras').setLabel('🟣 Cerebras').setStyle(current === 'cerebras' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ai_mistral').setLabel('🟠 Mistral').setStyle(current === 'mistral' ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ai_mix').setLabel('🌈 Mix').setStyle(current === 'mix' ? ButtonStyle.Success : ButtonStyle.Secondary),
      );
      await interaction.reply({ content: `**AI Provider:** ${current}\nPilih provider:`, components: [row], ephemeral: true });
      break;
    }

    case 'ai_google':
    case 'ai_cerebras':
    case 'ai_mistral':
    case 'ai_mix': {
      const provider = id.replace('ai_', '');
      config.ai.provider = provider;
      const configPath = path.join(process.cwd(), 'config.js');
      let content = fs.readFileSync(configPath, 'utf-8');
      content = content.replace(/provider:\s*["'].*?["']/, `provider: "${provider}"`);
      fs.writeFileSync(configPath, content);
      await interaction.update({ content: `✅ AI Provider → **${provider}**`, components: [] });
      await updatePanel(interaction);
      break;
    }

    case 'exit': {
      const count = stopBots();
      await interaction.reply({ content: `🛑 **Force stopped** ${count} sessions. Mode reset ke idle.`, ephemeral: true });
      await updatePanel(interaction);
      break;
    }

    case 'setlog': {
      logChannelId = interaction.channelId;
      setDiscordLogChannel(interaction.channel);
      await interaction.reply({ content: `✅ Log channel set ke **#${interaction.channel.name}**`, ephemeral: true });
      break;
    }

    case 'refresh': {
      await interaction.reply({ content: '🔄 Panel refreshed!', ephemeral: true });
      await updatePanel(interaction);
      break;
    }
  }
}

// ============================================
// SEND PANEL COMMAND
// ============================================
async function sendPanel(channel) {
  // Delete old panel if exists
  if (panelMessage) {
    try { await panelMessage.delete(); } catch (e) {}
  }

  panelMessage = await channel.send({
    embeds: [buildPanelEmbed()],
    components: buildPanelButtons()
  });
}

// ============================================
// EVENT HANDLERS
// ============================================
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return;

  // !panel command to send the control panel
  if (msg.content === '!panel') {
    await msg.delete().catch(() => {});
    await sendPanel(msg.channel);
  }

  // !setlog command (text fallback)
  if (msg.content === '!setlog') {
    logChannelId = msg.channelId;
    setDiscordLogChannel(msg.channel);
    msg.reply(`✅ Log channel set ke **#${msg.channel.name}**`);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;
  try {
    await handleButton(interaction);
  } catch (e) {
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `❌ Error: ${e.message}`, ephemeral: true });
      } else {
        await interaction.reply({ content: `❌ Error: ${e.message}`, ephemeral: true });
      }
    } catch (err) {}
  }
});

client.once('ready', () => {
  console.log(chalk.green(`[Discord] ✅ Logged in as ${client.user.tag}`));
  console.log(chalk.gray(`[Discord] Send !panel in a channel to create the control panel`));
});

// ============================================
// START
// ============================================
function startDiscordBot() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.log(chalk.red('[Discord] ❌ DISCORD_TOKEN not found in .env'));
    return;
  }
  client.login(token);
}

module.exports = { startDiscordBot };
