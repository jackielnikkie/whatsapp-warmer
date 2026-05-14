const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { BotSession } = require('../core/BotSession');
const config = require('../../config');
const { delay, log } = require('../utils/helpers');

async function waConfigMode(showMenu, selectSessions) {
  console.clear();
  console.log(chalk.bgGreen.black.bold("\n  ⚙️ WA NEW CONFIGURATION  \n"));
  console.log(chalk.gray("  Setup privacy, profile name, status, dan foto\n"));

  const sessions = await selectSessions("WA config");
  if (!sessions.length) return showMenu();

  console.log(chalk.cyan(`\n⚙️ Configuring ${sessions.length} session(s)...\n`));
  console.log(chalk.gray("💡 Tip: Press Ctrl+C to stop and return to menu\n"));

  let exitRequested = false;
  const bots = [];

  const handleExit = async () => {
    if (exitRequested) return;
    exitRequested = true;
    console.log(chalk.yellow("\n\n⏸️  Stopping..."));
    bots.forEach(b => b.disconnect());
    process.removeListener('SIGINT', handleExit);
    await delay(1000);
    console.clear();
    await showMenu();
  };

  process.on('SIGINT', handleExit);

  for (let i = 0; i < sessions.length; i++) {
    if (exitRequested) break;
    const name = sessions[i];

    const bot = new BotSession({
      name,
      enabled: true,
      autoJoinGroups: false,
      autoStartIntervals: false,
      replyToUsers: false,
      enableInterSession: false
    });

    try {
      await bot.start();
      console.log(chalk.green(`✅ [${name}] Connected!`));
      bots.push(bot);

      await applyConfig(bot);

    } catch (e) {
      console.log(chalk.red(`❌ [${name}] Error: ${e.message}`));
    }

    if (i < sessions.length - 1) await delay(3000);
  }

  if (!exitRequested) {
    console.log(chalk.green(`\n✅ Configuration selesai untuk semua session!`));
    await delay(3000);
    bots.forEach(b => b.disconnect());
    await delay(1000);
    console.clear();
    await showMenu();
  }
}

async function applyConfig(bot) {
  const sock = bot.sock;
  const name = bot.name;
  const cfg = config.waConfig || {};

  // 1. Privacy: Last Seen
  try {
    await sock.updateLastSeenPrivacy(cfg.lastSeenPrivacy || 'none');
    log(name, "SYSTEM", `🔒 Last Seen → ${cfg.lastSeenPrivacy || 'none'}`);
  } catch (e) {
    log(name, "ERROR", `Last Seen privacy failed: ${e.message}`);
  }
  await delay(2000);

  // 2. Privacy: Read Receipts
  try {
    await sock.updateReadReceiptsPrivacy(cfg.readReceiptsPrivacy || 'none');
    log(name, "SYSTEM", `🔒 Read Receipts → ${cfg.readReceiptsPrivacy || 'none'}`);
  } catch (e) {
    log(name, "ERROR", `Read Receipts privacy failed: ${e.message}`);
  }
  await delay(2000);

  // 3. Profile Name (random from list)
  try {
    const names = cfg.profileNames || ['Raka', 'Dimas', 'Galih'];
    const randomName = names[Math.floor(Math.random() * names.length)];
    await sock.updateProfileName(randomName);
    log(name, "SYSTEM", `👤 Profile Name → ${randomName}`);
  } catch (e) {
    log(name, "ERROR", `Profile Name failed: ${e.message}`);
  }
  await delay(2000);

  // 4. Profile Status (random from list)
  try {
    const statuses = cfg.profileStatuses || ['santai aja', 'busy', 'available'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    await sock.updateProfileStatus(randomStatus);
    log(name, "SYSTEM", `📝 Profile Status → ${randomStatus}`);
  } catch (e) {
    log(name, "ERROR", `Profile Status failed: ${e.message}`);
  }
  await delay(2000);

  // 5. Profile Picture (random from folder)
  try {
    const picFolder = cfg.profilePicFolder || './data/profile_pics';
    if (fs.existsSync(picFolder)) {
      const pics = fs.readdirSync(picFolder).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
      if (pics.length > 0) {
        const randomPic = pics[Math.floor(Math.random() * pics.length)];
        const picPath = path.join(picFolder, randomPic);
        await sock.updateProfilePicture(sock.user.id, { url: picPath });
        log(name, "SYSTEM", `🖼️ Profile Picture → ${randomPic}`);
      } else {
        log(name, "WARN", `⚠️ No pictures found in ${picFolder}`);
      }
    } else {
      log(name, "WARN", `⚠️ Folder ${picFolder} not found`);
    }
  } catch (e) {
    log(name, "ERROR", `Profile Picture failed: ${e.message}`);
  }
  await delay(2000);

  // 6. Post Text Story
  try {
    const stories = cfg.stories || [
      "lagi gabut nih", "hari ini produktif bgt", "ngopi dulu",
      "healing time", "grind never stops", "vibing aja",
    ];
    const bgColors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#2C3E50', '#8E44AD'];
    const fonts = [0, 1, 2, 3, 4, 5];

    const storyText = stories[Math.floor(Math.random() * stories.length)];
    const bgColor = bgColors[Math.floor(Math.random() * bgColors.length)];
    const font = fonts[Math.floor(Math.random() * fonts.length)];

    // Get all group participants as statusJidList
    const groups = await sock.groupFetchAllParticipating();
    const jidList = new Set();
    for (const group of Object.values(groups)) {
      for (const p of group.participants) {
        if (p.id !== sock.user.id) jidList.add(p.id);
      }
    }

    await sock.sendMessage('status@broadcast', {
      text: storyText
    }, {
      backgroundColor: bgColor,
      font: font,
      statusJidList: Array.from(jidList),
      broadcast: true
    });
    log(name, "SYSTEM", `📖 Story posted → "${storyText}" (visible to ${jidList.size} contacts)`);
  } catch (e) {
    log(name, "ERROR", `Story failed: ${e.message}`);
  }
}
module.exports = { waConfigMode, applyConfig };
