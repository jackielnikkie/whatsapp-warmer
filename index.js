require("dotenv").config();

const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const { Select, Input } = require("enquirer");

const config = require("./config.js");
const { BotSession, interSessionManager } = require("./src/core/BotSession");

// Import modes
const {
  pairingMode,
  getExistingSessions,
  joinGroupsMode,
  chatInGroupsMode,
  dmMembersMode,
  alwaysOnlineMode,
  sessionHealthMode,
  aiSettingsMode,
  waConfigMode
} = require("./src/modes");

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================
// MAIN MENU
// ============================================
async function showMenu() {
  console.clear();
  console.log(chalk.bgMagenta.bold("\n  🤖 WA-WARMER - Multi Session Bot  \n"));

  const existing = getExistingSessions();
  
  // Show sessions with phone numbers
  if (existing.length > 0) {
    const sessionInfo = existing.map(name => {
      const credsPath = path.join("sessions", name, "creds.json");
      try {
        if (fs.existsSync(credsPath)) {
          const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
          const phone = creds.me?.id?.split(':')[0] || creds.me?.id?.split('@')[0] || '?';
          return `${name}(${phone})`;
        }
      } catch (e) {}
      return name;
    });
    console.log(chalk.gray(`  Sessions: ${sessionInfo.join(", ")}\n`));
  } else {
    console.log(chalk.gray(`  Sessions: none\n`));
  }

  const prompt = new Select({
    name: "mode",
    message: "Pilih mode:",
    choices: [
      { name: "pairing", message: "📱 Pairing (tambah nomor baru)" },
      { name: "join", message: "📥 Join Groups (dari target_groups.txt)" },
      { name: "chat", message: "💬 Chat in Groups (inter-session)" },
      { name: "dm", message: "📩 DM Members (random DM)" },
      { name: "online", message: "🟢 Always Online (reject calls)" },
      { name: "waconfig", message: "⚙️ WA New Configuration" },
      { name: "health", message: "🏥 Session Health Check" },
      { name: "ai", message: "🤖 AI Settings" },
      { name: "exit", message: "🚪 Exit" },
    ],
  });

  const choice = await prompt.run();

  switch (choice) {
    case "pairing": await pairingMode(showMenu); break;
    case "join": await joinGroupsMode(showMenu, selectSessions); break;
    case "chat": await chatInGroupsMode(showMenu, selectSessions, startSessions, interSessionManager); break;
    case "dm": await dmMembersMode(showMenu, selectSessions); break;
    case "online": await alwaysOnlineMode(showMenu, selectSessions); break;
    case "waconfig": await waConfigMode(showMenu, selectSessions); break;
    case "health": await sessionHealthMode(showMenu); break;
    case "ai": await aiSettingsMode(showMenu); break;
    default: process.exit(0);
  }
}

// ============================================
// UTILS
// ============================================
async function selectSessions(action, minRequired = 1) {
  const existing = getExistingSessions();
  
  if (existing.length === 0) {
    console.log(chalk.red("❌ Belum ada session! Pairing dulu.\n"));
    await delay(2000);
    return [];
  }

  if (existing.length < minRequired) {
    console.log(chalk.red(`❌ Minimal ${minRequired} session untuk ${action}!\n`));
    await delay(2000);
    return [];
  }

  console.log(chalk.gray(`Sessions tersedia: ${existing.join(", ")}\n`));

  const prompt = new Select({
    name: "select",
    message: `Pilih session untuk ${action}:`,
    choices: [
      { name: "all", message: `Semua (${existing.length} sessions)` },
      { name: "select", message: "Pilih manual" },
      { name: "back", message: "← Kembali" },
    ],
  });

  const choice = await prompt.run();
  
  if (choice === "back") return [];
  if (choice === "all") return existing;

  // Manual select
  const inputPrompt = new Input({
    message: "Masukkan nama session (pisah koma, contoh: bot1,bot2):",
  });
  const input = await inputPrompt.run();
  return input.split(",").map(s => s.trim()).filter(s => existing.includes(s));
}

async function startSessions(sessionNames, options = {}) {
  const bots = [];
  const { 
    autoJoinGroups = false, 
    autoStartIntervals = false,
    replyToUsers = true,
    enableInterSession = false
  } = options;
  
  console.log(chalk.gray("\n💡 Tip: Press Ctrl+C to stop and return to menu\n"));
  
  let exitRequested = false;
  
  const handleExit = async () => {
    if (exitRequested) return;
    exitRequested = true;
    
    console.log(chalk.yellow("\n\n⏸️  Stopping sessions..."));
    
    for (const bot of bots) {
      if (bot.ready) bot.stopIntervals();
    }
    
    process.removeListener('SIGINT', handleExit);
    
    await delay(1000);
    console.clear();
    await showMenu();
  };
  
  process.on('SIGINT', handleExit);
  
  for (const name of sessionNames) {
    if (exitRequested) break;
    
    const bot = new BotSession({ 
      name, 
      enabled: true,
      autoJoinGroups,
      autoStartIntervals,
      replyToUsers,
      enableInterSession
    });
    bots.push(bot);
    
    try {
      await bot.start();
      console.log(chalk.green(`✅ [${name}] Connected! (${bot.botName})`));
    } catch (e) {
      console.log(chalk.red(`❌ [${name}] ${e.message}`));
    }
    await delay(3000);
  }
  
  if (!exitRequested) {
    console.log(chalk.green("\n✅ All sessions running!"));
    console.log(chalk.yellow("💡 Press Ctrl+C to stop and return to menu\n"));
  }
  
  return bots.filter(b => b.ready);
}

// Start
if (config.serverPterodactyl) {
  // Pterodactyl mode: skip menu, start Discord bot for control
  const { startDiscordBot } = require('./discord/bot');
  startDiscordBot();
  console.log(chalk.green('🚀 [Pterodactyl] Discord bot started. Use !help in Discord.'));
} else {
  showMenu().catch(console.error);
}
