const chalk = require('chalk');
const config = require('../../config');

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const randomDelay = (min, max) => delay(min + Math.random() * (max - min));

function calculateTypingDelay(message, configTyping) {
  const typing = configTyping || { baseMin: 1000, baseMax: 2000, perChar: 50, maxTotal: 8000 };
  const baseDelay = typing.baseMin + Math.random() * (typing.baseMax - typing.baseMin);
  const charDelay = message.length * typing.perChar;
  const totalDelay = Math.min(baseDelay + charDelay, typing.maxTotal);
  return Math.round(totalDelay);
}

// Discord log hook
let discordLogChannel = null;

function setDiscordLogChannel(channel) {
  discordLogChannel = channel;
}

const typeEmoji = {
  SYSTEM: '⚙️',
  JOIN: '📥',
  AI_CHAT: '🤖',
  DM: '📩',
  REPLY: '💬',
  STATUS: '📱',
  ERROR: '❌',
  WARN: '⚠️',
  CLEANUP: '🗑️',
  'INTER-SESSION': '🔗',
};

function log(sessionName, type, message) {
  const time = new Date().toLocaleTimeString("id-ID");
  const prefix = chalk.gray(`[${time}]`);
  const sessionTag = chalk.cyan(`[${sessionName}]`);
  
  let typeTag;
  switch (type) {
    case "SYSTEM": typeTag = chalk.bgGreen.black(" SYSTEM "); break;
    case "JOIN": typeTag = chalk.bgBlue.black(" JOIN "); break;
    case "AI_CHAT": typeTag = chalk.bgYellow.black(" AI_CHAT "); break;
    case "DM": typeTag = chalk.bgMagenta.black(" DM "); break;
    case "REPLY": typeTag = chalk.bgCyan.black(" REPLY "); break;
    case "STATUS": typeTag = chalk.bgWhite.black(" STATUS "); break;
    case "ERROR": typeTag = chalk.bgRed.black(" ERROR "); break;
    case "WARN": typeTag = chalk.bgYellow.black(" WARN "); break;
    default: typeTag = chalk.gray(` ${type} `);
  }

  console.log(`${prefix} ${sessionTag} ${typeTag} ${message}`);

  // Send to Discord if channel is set
  if (discordLogChannel) {
    const emoji = typeEmoji[type] || '📝';
    const discordMsg = `${emoji} \`[${time}]\` **[${sessionName}]** \`${type}\` ${message}`;
    discordLogChannel.send(discordMsg).catch(() => {});
  }
}

const debugLog = {
  baileys: (msg) => config?.debug?.baileys && console.log(chalk.gray(`[BAILEYS] ${msg}`)),
  ai: (msg) => config?.debug?.ai && console.log(chalk.cyan(`[AI] ${msg}`)),
  chat: (msg) => config?.debug?.chat && console.log(chalk.magenta(`[CHAT] ${msg}`)),
  groups: (msg) => config?.debug?.groups && console.log(chalk.blue(`[GROUPS] ${msg}`)),
};

module.exports = { delay, randomDelay, calculateTypingDelay, log, debugLog, setDiscordLogChannel };
