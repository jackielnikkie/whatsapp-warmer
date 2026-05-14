const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { Input, Confirm } = require('enquirer');
const { makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers, DisconnectReason } = require("@whiskeysockets/baileys");
const pino = require("pino");

const logger = pino({ level: "silent" });
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function getExistingSessions() {
  const dir = path.join(".", "sessions");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => fs.statSync(path.join(dir, f)).isDirectory() && f.startsWith("bot"))
    .sort((a, b) => parseInt(a.replace("bot", "")) - parseInt(b.replace("bot", "")));
}

async function pairSession(sessionName) {
  const authFolder = path.join("sessions", sessionName);
  if (!fs.existsSync(authFolder)) fs.mkdirSync(authFolder, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version } = await fetchLatestBaileysVersion();

  if (state.creds.registered) {
    console.log(chalk.yellow(`${sessionName} sudah paired, skip...`));
    return;
  }

  return new Promise(async (resolve, reject) => {
    let sock = null;
    let done = false, requested = false;

    const connect = async () => {
      const currentState = await useMultiFileAuthState(authFolder);
      
      sock = makeWASocket({
        version,
        logger,
        auth: { creds: currentState.state.creds, keys: makeCacheableSignalKeyStore(currentState.state.keys, logger) },
        browser: Browsers.ubuntu("Chrome"),
        printQRInTerminal: false,
      });

      sock.ev.on("creds.update", currentState.saveCreds);

      sock.ev.on("connection.update", async (update) => {
        if (update.qr && !requested) {
          requested = true;
          try {
            const phonePrompt = new Input({
              message: `Masukkan nomor WA (628xxx):`,
              validate: (v) => v.length >= 10 || "Min 10 digit",
            });
            const phone = await phonePrompt.run();

            console.log(chalk.cyan(`⏳ Request pairing code...`));
            const code = await sock.requestPairingCode(phone);

            console.log(chalk.green(`\n════════════════════════════`));
            console.log(chalk.green(`  KODE PAIRING: ${chalk.bold(code)}`));
            console.log(chalk.green(`════════════════════════════`));
            console.log(chalk.yellow(`\n⏳ Masukkan kode di WA > Linked Devices\n`));
          } catch (e) {
            if (!done) { done = true; sock.end(); reject(e); }
          }
        }

        if (update.connection === "open" && !done) {
          done = true;
          console.log(chalk.green(`✅ ${sessionName} CONNECTED!`));
          await delay(2000);
          sock.end();
          resolve();
        }

        if (update.connection === "close" && !done) {
          const statusCode = update.lastDisconnect?.error?.output?.statusCode;
          if (statusCode === 515 || statusCode === 428) {
            await delay(3000);
            connect();
          } else if (statusCode === DisconnectReason.loggedOut) {
            done = true;
            reject(new Error("Logged out"));
          } else if (requested) {
            await delay(3000);
            connect();
          }
        }
      });
    };

    connect();
    setTimeout(() => {
      if (!done) { done = true; sock?.end(); reject(new Error("Timeout 5 menit")); }
    }, 300000);
  });
}

async function pairingMode(showMenu) {
  console.clear();
  console.log(chalk.bgBlue.bold("\n  📱 PAIRING MODE  \n"));

  const existing = getExistingSessions();
  const nextNum = existing.length > 0 
    ? Math.max(...existing.map(s => parseInt(s.replace("bot", "")) || 0)) + 1 
    : 1;

  const countPrompt = new Input({
    message: "Mau pairing berapa nomor? (ketik 0 untuk back)",
    initial: "1",
    validate: (value) => {
      const num = parseInt(value);
      if (isNaN(num) || num < 0 || num > 50) return "Masukkan angka 0-50 (0 = back)";
      return true;
    }
  });

  let count;
  try {
    const input = await countPrompt.run();
    count = parseInt(input);
    if (count === 0) { await showMenu(); return; }
  } catch (e) {
    console.log(chalk.yellow("\n⏸️  Cancelled, returning to menu...\n"));
    await delay(1000);
    await showMenu();
    return;
  }
  
  console.log(chalk.cyan(`\n📝 Akan pairing ${count} nomor...\n`));

  for (let i = 0; i < count; i++) {
    const sessionName = `bot${nextNum + i}`;
    console.log(chalk.yellow(`\n━━━ [${i + 1}/${count}] ${sessionName} ━━━\n`));

    try {
      await pairSession(sessionName);
      console.log(chalk.green(`\n✅ ${sessionName} paired!\n`));
    } catch (err) {
      console.log(chalk.red(`\n❌ ${sessionName} gagal: ${err.message}\n`));
      
      if (i < count - 1) {
        const cont = new Confirm({ name: "c", message: "Lanjut ke nomor berikutnya?" });
        try {
          if (!(await cont.run())) break;
        } catch (e) {
          console.log(chalk.yellow("\n⏸️  Cancelled, returning to menu...\n"));
          await delay(1000);
          await showMenu();
          return;
        }
      }
    }

    if (i < count - 1) await delay(2000);
  }

  console.log(chalk.green("\n✅ Pairing selesai!\n"));
  await delay(2000);
  await showMenu();
}

module.exports = { pairingMode, pairSession, getExistingSessions };
