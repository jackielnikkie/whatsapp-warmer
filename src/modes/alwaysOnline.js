const chalk = require('chalk');
const { BotSession } = require('../core/BotSession');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function alwaysOnlineMode(showMenu, selectSessions) {
  console.clear();
  console.log(chalk.bgGreen.bold("\n  🟢 ALWAYS ONLINE MODE  \n"));
  console.log(chalk.gray("  Bot akan stay online & auto reject calls\n"));

  const sessions = await selectSessions("always online");
  if (!sessions.length) return showMenu();

  console.log(chalk.cyan(`\n🚀 Starting ${sessions.length} session(s)...\n`));

  const bots = [];

  for (let i = 0; i < sessions.length; i++) {
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
      bots.push(bot);
      
      // Set presence to available
      await bot.sock.sendPresenceUpdate('available');
      
      const phone = bot.sock.user?.id?.split(':')[0] || '?';
      console.log(chalk.green(`✅ [${name}] Online (${phone})`));
      
    } catch (e) {
      console.log(chalk.red(`❌ [${name}] Error: ${e.message}`));
    }
    
    if (i < sessions.length - 1) await delay(2000);
  }

  if (bots.length === 0) {
    console.log(chalk.red("\n❌ Tidak ada session yang berhasil connect\n"));
    await delay(2000);
    return showMenu();
  }

  console.log(chalk.green(`\n✅ ${bots.length} session(s) online!`));
  console.log(chalk.gray("Tekan Ctrl+C untuk stop dan kembali ke menu\n"));

  // Keep alive - update presence every 5 minutes
  const keepAlive = setInterval(async () => {
    for (const bot of bots) {
      if (bot.ready && bot.sock) {
        try {
          await bot.sock.sendPresenceUpdate('available');
        } catch (e) {}
      }
    }
  }, 5 * 60 * 1000);

  // Handle Ctrl+C
  const cleanup = async () => {
    clearInterval(keepAlive);
    console.log(chalk.yellow("\n\n⏳ Disconnecting..."));
    for (const bot of bots) {
      bot.disconnect();
    }
    console.log(chalk.green("✅ All disconnected\n"));
    await delay(1000);
    process.removeListener('SIGINT', cleanup);
    await showMenu();
  };

  process.on('SIGINT', cleanup);
}

module.exports = { alwaysOnlineMode };
