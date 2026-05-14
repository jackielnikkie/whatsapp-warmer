const chalk = require('chalk');
const { Confirm } = require('enquirer');
const { BotSession } = require('../core/BotSession');

const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function joinGroupsMode(showMenu, selectSessions) {
  console.clear();
  console.log(chalk.bgGreen.bold("\n  📥 JOIN GROUPS MODE  \n"));

  const sessions = await selectSessions("join grup");
  if (!sessions.length) return showMenu();

  console.log(chalk.cyan(`\n🚀 Will join groups with ${sessions.length} session(s)\n`));

  const bots = [];

  // Connect and join for each bot sequentially
  for (let i = 0; i < sessions.length; i++) {
    const name = sessions[i];
    console.log(chalk.yellow(`\n━━━ [${i + 1}/${sessions.length}] ${name} ━━━\n`));
    
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
      
      // Join groups
      await bot.joinTargetGroups();
      console.log(chalk.green(`✅ [${name}] Join selesai\n`));
      
    } catch (e) {
      console.log(chalk.red(`❌ [${name}] Error: ${e.message}\n`));
    }
    
    if (i < sessions.length - 1) {
      await delay(2000);
    }
  }

  console.log(chalk.green(`\n✅ Join groups selesai untuk semua session!`));
  
  const cont = new Confirm({ name: "c", message: "Kembali ke menu?" });
  try {
    await cont.run();
  } catch (e) {}
  
  // Disconnect all bots
  console.log(chalk.yellow(`\n⏳ Disconnecting ${bots.length} session(s)...`));
  for (const bot of bots) {
    bot.disconnect();
  }
  console.log(chalk.green(`✅ All disconnected\n`));
  
  await delay(1000);
  await showMenu();
}

module.exports = { joinGroupsMode };
