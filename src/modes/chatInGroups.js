const chalk = require('chalk');
const config = require('../../config');

async function chatInGroupsMode(showMenu, selectSessions, startSessions, interSessionManager) {
  console.clear();
  console.log(chalk.bgYellow.black.bold("\n  💬 CHAT IN GROUPS MODE  \n"));
  console.log(chalk.gray("  Bot akan chat di grup dan saling reply\n"));
  
  // Show AI provider
  const provider = config.ai.provider || "google";
  const providerEmoji = provider === "google" ? "🔵" : provider === "cerebras" ? "🟣" : "🌈";
  console.log(chalk.gray(`  AI Provider: ${providerEmoji} ${provider}\n`));

  const sessions = await selectSessions("chat di grup", 2);
  if (sessions.length < 2) {
    console.log(chalk.red("\n❌ Minimal 2 session untuk inter-session chat!\n"));
    await new Promise(r => setTimeout(r, 2000));
    return showMenu();
  }

  console.log(chalk.cyan(`\n🚀 Starting ${sessions.length} session untuk chat...\n`));

  const bots = await startSessions(sessions, { 
    autoJoinGroups: false, 
    autoStartIntervals: false,
    replyToUsers: false,
    enableInterSession: true
  });

  // Setup inter-session
  if (config.interSession?.enabled) {
    interSessionManager.config = config;
    interSessionManager.initialized = true;
    console.log(chalk.green(`\n🔗 Inter-session enabled dengan ${bots.length} bots`));
  }

  // Start hanya interval chat untuk setiap bot
  for (const bot of bots) {
    bot.intervals.push(setInterval(
      () => bot.aiChatToGroups(),
      config.intervals.groupChatInterval * 60 * 60 * 1000
    ));
  }

  // Trigger chat pertama dari bot pertama setelah delay
  console.log(chalk.yellow(`\n⏳ Bot pertama akan mulai chat dalam 10 detik...\n`));
  setTimeout(() => {
    if (bots[0]?.ready) {
      bots[0].aiChatToGroups();
    }
  }, 10000);

  console.log(chalk.green(`\n🎉 Chat mode aktif! Bot akan saling reply.`));
  console.log(chalk.gray("Tekan Ctrl+C untuk stop\n"));

  process.on("SIGINT", async () => {
    console.log(chalk.yellow("\n🛑 Stopping..."));
    bots.forEach(b => { b.stopIntervals(); b.sock?.end(); });
    process.exit(0);
  });
}

module.exports = { chatInGroupsMode };
