const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const pino = require('pino');
const { Confirm } = require('enquirer');
const { getExistingSessions } = require('./pairing');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
} = require('@whiskeysockets/baileys');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const logger = pino({ level: 'fatal' });

async function checkSession(sessionName) {
  const sessionPath = path.join('.', 'sessions', sessionName);
  const credsPath = path.join(sessionPath, 'creds.json');

  if (!fs.existsSync(credsPath)) {
    return { name: sessionName, status: 'broken', reason: 'Missing creds.json' };
  }

  let creds;
  try {
    creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
    if (!creds.registered) {
      return { name: sessionName, status: 'broken', reason: 'Not registered' };
    }
  } catch (e) {
    return { name: sessionName, status: 'broken', reason: 'Corrupt creds.json' };
  }

  try {
    const { state } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    return await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        try { sock.ws.close(); } catch (e) {}
        resolve({ name: sessionName, status: 'timeout', reason: 'Connection timeout (20s)' });
      }, 20000);

      const sock = makeWASocket({
        version,
        logger,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        browser: Browsers.ubuntu('Chrome'),
        printQRInTerminal: false,
        // Don't sync history - lightweight check only
        syncFullHistory: false,
      });

      // JANGAN save creds - biar gak conflict sama session berikutnya
      // sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'open') {
          clearTimeout(timeout);
          const phone = sock.user?.id?.split(':')[0] || '?';
          // Force close tanpa graceful logout
          try { sock.ws.close(); } catch (e) {}
          resolve({ name: sessionName, status: 'healthy', reason: `OK (${phone})` });
        }

        if (connection === 'close') {
          clearTimeout(timeout);
          const statusCode = lastDisconnect?.error?.output?.statusCode;

          if (statusCode === 403 || statusCode === 401 || statusCode === DisconnectReason.forbidden) {
            resolve({ name: sessionName, status: 'banned', reason: `Banned (code: ${statusCode})` });
          } else if (statusCode === DisconnectReason.loggedOut) {
            resolve({ name: sessionName, status: 'logged_out', reason: 'Logged out' });
          } else if (statusCode === 515) {
            // 515 = restart required, session masih valid
            resolve({ name: sessionName, status: 'healthy', reason: `OK (restart needed)` });
          } else {
            resolve({ name: sessionName, status: 'error', reason: `Error (code: ${statusCode || '?'})` });
          }
        }
      });
    });
  } catch (err) {
    return { name: sessionName, status: 'error', reason: err.message };
  }
}

function cleanupSession(sessionName) {
  const sessionPath = path.join('.', 'sessions', sessionName);
  fs.rmSync(sessionPath, { recursive: true, force: true });

  const joinedGroupsPath = path.join('.', 'data', 'joined_groups.json');
  if (fs.existsSync(joinedGroupsPath)) {
    const data = JSON.parse(fs.readFileSync(joinedGroupsPath, 'utf-8'));
    let changed = false;
    if (data.groups) {
      for (const group of data.groups) {
        if (group.joinedBy?.includes(sessionName)) {
          group.joinedBy = group.joinedBy.filter(s => s !== sessionName);
          changed = true;
        }
      }
      data.groups = data.groups.filter(g => g.joinedBy && g.joinedBy.length > 0);
    }
    if (changed) {
      fs.writeFileSync(joinedGroupsPath, JSON.stringify(data, null, 2));
    }
  }
}

async function sessionHealthMode(showMenu) {
  console.clear();
  console.log(chalk.bgGreen.bold("\n  🏥 SESSION HEALTH CHECK  \n"));

  const existing = getExistingSessions();

  if (existing.length === 0) {
    console.log(chalk.red("❌ Belum ada session!\n"));
    await delay(2000);
    await showMenu();
    return;
  }

  console.log(chalk.cyan(`\n📊 Checking ${existing.length} session(s)...\n`));

  const results = [];

  for (const name of existing) {
    process.stdout.write(chalk.gray(`  ⏳ ${name}... `));
    const result = await checkSession(name);
    results.push(result);

    const icon = {
      healthy: chalk.green('✅'),
      banned: chalk.red('🚫'),
      logged_out: chalk.red('🔒'),
      broken: chalk.red('❌'),
      timeout: chalk.yellow('⏰'),
      error: chalk.yellow('⚠️'),
    }[result.status] || '❓';

    console.log(`${icon} ${result.reason}`);
    // Kasih jeda biar socket bener-bener closed sebelum cek session berikutnya
    await delay(2000);
  }

  const healthy = results.filter(r => r.status === 'healthy');
  const dead = results.filter(r => ['banned', 'logged_out', 'broken'].includes(r.status));

  console.log(chalk.cyan(`\n📊 ${healthy.length} healthy, ${dead.length} dead\n`));

  if (dead.length > 0) {
    for (const d of dead) {
      console.log(chalk.red(`   ${d.name} - ${d.reason}`));
    }

    const confirm = new Confirm({
      name: 'cleanup',
      message: `Hapus ${dead.length} dead session(s) + cleanup joined_groups?`,
      initial: true,
    });

    if (await confirm.run()) {
      for (const d of dead) {
        cleanupSession(d.name);
        console.log(chalk.green(`  🗑️ ${d.name} cleaned`));
      }
      console.log(chalk.green(`\n✅ Done!\n`));
    }
  } else {
    console.log(chalk.green("✅ All sessions healthy!\n"));
  }

  await delay(2000);
  await showMenu();
}

module.exports = { sessionHealthMode };
