const chalk = require('chalk');
const { BotSession } = require('../core/BotSession');
const config = require('../../config');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function dmMembersMode(showMenu, selectSessions) {
  console.clear();
  console.log(chalk.bgMagenta.bold("\n  📩 DM MEMBERS MODE  \n"));
  
  const provider = config.ai.provider || "google";
  const providerEmoji = provider === "google" ? "🔵" : provider === "cerebras" ? "🟣" : provider === "mistral" ? "🟠" : "🌈";
  console.log(chalk.gray(`  AI Provider: ${providerEmoji} ${provider}\n`));

  const sessions = await selectSessions("DM member");
  if (!sessions.length) return showMenu();

  console.log(chalk.cyan(`\n🚀 Will DM members with ${sessions.length} session(s)\n`));
  console.log(chalk.gray("💡 Tip: Press Ctrl+C to stop and return to menu\n"));

  const bots = [];
  let exitRequested = false;

  const handleExit = async () => {
    if (exitRequested) return;
    exitRequested = true;
    console.log(chalk.yellow("\n\n⏸️  Stopping DM mode..."));
    bots.forEach(b => { b.stopIntervals(); b.disconnect(); });
    process.removeListener('SIGINT', handleExit);
    await delay(1000);
    console.clear();
    await showMenu();
  };

  process.on('SIGINT', handleExit);

  // Connect all bots
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
      console.log(chalk.green(`✅ [${name}] Connected! (${bot.botName})`));
      bots.push(bot);
    } catch (e) {
      console.log(chalk.red(`❌ [${name}] Error: ${e.message}`));
    }
    
    if (i < sessions.length - 1) await delay(3000);
  }

  if (exitRequested) return;

  // All bots DM in parallel
  console.log(chalk.cyan(`\n🚀 All bots DM-ing...\n`));
  await Promise.all(bots.map(bot => bot.dmToGroupMembers()));
  console.log(chalk.green(`\n✅ Batch DM selesai!`));

  // Start interval for next batch
  const intervalHours = config.dmMembers?.interval || 3;
  for (const bot of bots) {
    bot.intervals.push(setInterval(
      () => bot.dmToGroupMembers(),
      intervalHours * 60 * 60 * 1000
    ));
  }

  console.log(chalk.green(`\n🎉 DM mode aktif! Batch tiap ${intervalHours} jam.`));
  console.log(chalk.yellow("💡 Press Ctrl+C to stop and return to menu\n"));
}

module.exports = { dmMembersMode };
