require("dotenv").config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const { Input } = require("enquirer");
const NodeCache = require("node-cache");

const config = require('../../config');
const GroupManager = require('../managers/GroupManager');
const AIManager = require('../managers/AIManager');
const AntiLoopManager = require('./AntiLoopManager');
const InterSessionManager = require('./InterSessionManager');
const ConversationEngine = require('./ConversationEngine');
const { delay, randomDelay, calculateTypingDelay, log, debugLog } = require('../utils/helpers');

const logger = pino({ level: config.debug?.baileys ? config.logging.level : "fatal" });

// Shared instance
const interSessionManager = new InterSessionManager();

class BotSession {
  constructor(sessionConfig) {
    this.name = sessionConfig.name;
    this.enabled = sessionConfig.enabled;
    this.authFolder = path.join("sessions", this.name);
    this.sock = null;
    this.ready = false;
    this.groupManager = new GroupManager();
    this.antiLoop = new AntiLoopManager();
    this.intervals = [];
    this.connectionResolve = null;
    this.connectionReject = null;
    this.isConnecting = false;
    this.processedCalls = new Set();
    this.hasResolved = false;
    this.pairingRequested = false;
    this.groupCache = new NodeCache({ stdTTL: 5 * 60, useClones: false });
    
    this.autoJoinGroups = sessionConfig.autoJoinGroups !== false;
    this.autoStartIntervals = sessionConfig.autoStartIntervals !== false;
    this.replyToUsers = sessionConfig.replyToUsers !== false;
    this.enableInterSession = sessionConfig.enableInterSession === true;
    this.intentionalDisconnect = false;
    
    const names = config.ai?.names || ["Raka", "Dimas", "Galih"];
    this.botName = names[Math.floor(Math.random() * names.length)];
  }

  async start() {
    if (!this.enabled) {
      log(this.name, "SYSTEM", "Session disabled, skipping");
      return;
    }

    if (this.isConnecting) {
      log(this.name, "SYSTEM", "Already connecting, waiting...");
      return;
    }

    this.isConnecting = true;
    log(this.name, "SYSTEM", "Starting session...");

    if (!fs.existsSync(this.authFolder)) {
      fs.mkdirSync(this.authFolder, { recursive: true });
    }

    return new Promise(async (resolve, reject) => {
      this.connectionResolve = resolve;
      this.connectionReject = reject;
      
      try {
        await this.createSocket();
      } catch (err) {
        this.isConnecting = false;
        reject(err);
      }
      
      setTimeout(() => {
        if (this.isConnecting) {
          this.isConnecting = false;
          if (this.connectionReject) {
            this.connectionReject(new Error("Connection timeout (2 menit)"));
          }
        }
      }, 120000);
    });
  }

  async createSocket() {
    const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);
    const { version } = await fetchLatestBaileysVersion();
    
    const needPairing = !state.creds.registered;

    this.sock = makeWASocket({
      version,
      logger,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      browser: Browsers.ubuntu("Chrome"),
      cachedGroupMetadata: async (jid) => this.groupCache.get(jid),
      printQRInTerminal: false,
    });

    this.sock.ev.on("creds.update", saveCreds);
    this.sock.ev.on("messages.upsert", (m) => this.handleMessages(m));
    this.sock.ev.on("call", (calls) => this.handleCalls(calls));

    if (needPairing) {
      this.sock.ev.on("connection.update", async (update) => {
        if (update.qr && !this.pairingRequested) {
          this.pairingRequested = true;
          await this.handlePairing();
        }
        this.handleConnectionUpdate(update);
      });
    } else {
      this.sock.ev.on("connection.update", (update) => this.handleConnectionUpdate(update));
    }
    
    this.sock.ev.on("groups.update", async ([event]) => {
      try {
        const metadata = await this.sock.groupMetadata(event.id);
        this.groupCache.set(event.id, metadata);
      } catch (e) {}
    });
    
    this.sock.ev.on("group-participants.update", async (event) => {
      try {
        const metadata = await this.sock.groupMetadata(event.id);
        this.groupCache.set(event.id, metadata);
        if (event.action === 'remove' && event.participants.includes(this.sock.user.id)) {
          this.handleGroupLeave(event.id);
        }
      } catch (e) {}
    });
  }

  async handlePairing() {
    try {
      const prompt = new Input({
        message: chalk.yellow(`[${this.name}] Masukkan nomor WhatsApp (628xxx):`),
        validate: (value) => (!value || value.trim().length < 10) ? "Nomor minimal 10 digit" : true
      });

      const phoneNumber = await prompt.run();
      console.log(chalk.cyan(`\n[${this.name}] ⏳ Request pairing code...`));
      
      const code = await this.sock.requestPairingCode(phoneNumber);
      
      console.log(chalk.green(`\n========================================`));
      console.log(chalk.green(`[${this.name}] ✅ KODE PAIRING: ${chalk.bold(code)}`));
      console.log(chalk.green(`========================================`));
      console.log(chalk.yellow(`[${this.name}] ⏳ Masukkan kode di WA > Linked Devices\n`));
    } catch (err) {
      console.log(chalk.red(`\n[${this.name}] ❌ Pairing gagal: ${err.message}`));
      throw err;
    }
  }

  async handleConnectionUpdate(update) {
    const { connection, lastDisconnect } = update;

    if (connection === "open") {
      if (!this.ready) {
        log(this.name, "SYSTEM", "✅ Connected");
        this.ready = true;
        this.isConnecting = false;

        if (this.enableInterSession && config.interSession?.enabled && this.sock?.user) {
          interSessionManager.sessionRegistry.register(
            this.name,
            this.sock.user.id,
            this.sock.user.id.split(':')[0].split('@')[0],
            true,
            this.sock.user.lid
          );
        }

        if (this.connectionResolve && !this.hasResolved) {
          this.hasResolved = true;
          this.connectionResolve();
          this.connectionResolve = null;
          this.connectionReject = null;
        }

        // Sync groups from WA with joined_groups.json
        await this.syncGroups();

        if (this.autoStartIntervals) {
          this.startIntervals();
        }

        if (this.autoJoinGroups) {
          await this.joinTargetGroups();
        }
      }
    }

    if (connection === "close") {
      this.ready = false;
      this.stopIntervals();

      // Skip reconnect if intentional disconnect
      if (this.intentionalDisconnect) {
        return;
      }

      log(this.name, "SYSTEM", "❌ Disconnected");

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isBanned = statusCode === 403 || statusCode === 401 || statusCode === DisconnectReason.forbidden;
      
      if (isBanned) {
        log(this.name, "SYSTEM", `🚫 BANNED - Auto cleanup...`);
        await this.cleanupBannedSession();
        return;
      }
      
      if (statusCode === 515) {
        log(this.name, "SYSTEM", "🔄 Restart required, reconnecting...");
        setTimeout(() => this.reconnect(), 3000);
        return;
      }
      
      if (statusCode !== DisconnectReason.loggedOut) {
        log(this.name, "SYSTEM", "🔄 Reconnecting...");
        setTimeout(() => this.reconnect(), 5000);
      }
    }
  }

  async cleanupBannedSession() {
    try {
      const sessionPath = path.join(__dirname, '../../sessions', this.name);
      fs.rmSync(sessionPath, { recursive: true, force: true });
      log(this.name, "CLEANUP", `🗑️ Deleted session folder`);
      
      const joinedGroupsPath = path.join(__dirname, '../../data/joined_groups.json');
      if (fs.existsSync(joinedGroupsPath)) {
        const joinedGroups = JSON.parse(fs.readFileSync(joinedGroupsPath, 'utf-8'));
        if (joinedGroups[this.name]) {
          delete joinedGroups[this.name];
          fs.writeFileSync(joinedGroupsPath, JSON.stringify(joinedGroups, null, 2));
        }
      }
      
      interSessionManager.sessionRegistry.unregister(this.name);
      log(this.name, "CLEANUP", `✅ Cleanup complete`);
    } catch (error) {
      console.error(chalk.red(`[${this.name}] CLEANUP ERROR: ${error.message}`));
    }
  }

  handleGroupLeave(groupJid) {
    this.groupManager.recordLeave(groupJid, this.name);
  }

  async syncGroups() {
    try {
      const groups = await this.sock.groupFetchAllParticipating();
      const groupIds = Object.keys(groups);
      if (groupIds.length === 0) return;

      let synced = 0;
      for (const jid of groupIds) {
        const meta = groups[jid];
        // Check if already recorded
        const existing = this.groupManager.data.groups.find(g => g.groupJid === jid);
        if (!existing) {
          this.groupManager.data.groups.push({
            inviteCode: null,
            groupJid: jid,
            name: meta.subject || 'Unknown',
            joinedBy: [this.name],
            discoveredAt: new Date().toISOString()
          });
          synced++;
        } else if (!existing.joinedBy.includes(this.name)) {
          existing.joinedBy.push(this.name);
          if (meta.subject) existing.name = meta.subject;
          synced++;
        }
      }

      if (synced > 0) {
        this.groupManager.save();
        log(this.name, "SYSTEM", `📋 Synced ${synced} groups (total: ${groupIds.length})`);
      }
    } catch (e) {
      // Silent fail - not critical
    }
  }

  async reconnect() {
    try {
      log(this.name, "SYSTEM", "🔄 Reconnecting...");
      await this.createSocket();
    } catch (err) {
      log(this.name, "ERROR", `❌ Reconnect failed: ${err.message}`);
      setTimeout(() => this.reconnect(), 10000);
    }
  }

  disconnect() {
    this.intentionalDisconnect = true;
    this.stopIntervals();
    this.sock?.end();
  }

  startIntervals() {
    this.intervals.push(setInterval(() => this.joinTargetGroups(), config.intervals.checkTargetGroups * 60 * 60 * 1000));
    this.intervals.push(setInterval(() => this.aiChatToGroups(), config.intervals.groupChatInterval * 60 * 60 * 1000));
    this.intervals.push(setInterval(() => this.dmToGroupMembers(), config.intervals.dmInterval * 60 * 60 * 1000));
    this.intervals.push(setInterval(() => this.updateStatus(), config.intervals.statusInterval * 60 * 60 * 1000));
    log(this.name, "SYSTEM", `⏰ Started ${this.intervals.length} intervals`);
  }

  stopIntervals() {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
  }

  async joinTargetGroups() {
    if (!this.ready) return;

    const unjoined = this.groupManager.getUnjoinedGroups(this.name);
    const currentCount = this.groupManager.getJoinedCount(this.name);

    if (currentCount >= config.groups.maxPerSession) {
      log(this.name, "WARN", `⚠️ Max groups (${config.groups.maxPerSession}) reached`);
      return;
    }

    if (unjoined.length === 0) return;

    log(this.name, "JOIN", `📝 Found ${unjoined.length} unjoined groups`);

    for (const url of unjoined) {
      if (this.groupManager.getJoinedCount(this.name) >= config.groups.maxPerSession) break;

      const code = this.groupManager.extractGroupCode(url);
      if (!code || this.groupManager.data.failed.includes(code)) continue;

      try {
        log(this.name, "JOIN", `⏳ Joining: ${code}...`);
        const groupJid = await this.sock.groupAcceptInvite(code);
        
        await delay(2000);
        let groupName = "Unknown";
        try {
          const meta = await this.sock.groupMetadata(groupJid);
          groupName = meta.subject;
        } catch (e) {}

        this.groupManager.recordJoin(code, groupJid, this.name, groupName);
        log(this.name, "JOIN", `✅ Joined: ${groupName}`);

        const delays = config?.delays?.joinGroup || { min: 10000, max: 20000 };
        await randomDelay(delays.min, delays.max);
      } catch (e) {
        log(this.name, "ERROR", `❌ Failed: ${e.message}`);
        this.groupManager.recordFailed(code);
      }
    }
  }

  async handleMessages(m) {
    if (!this.ready) return;

    try {
      const msg = m.messages[0];
      if (!msg || !msg.message) return;

      const msgId = msg.key.id;
      if (this.antiLoop.isMessageProcessed(msgId)) return;
      this.antiLoop.markMessageProcessed(msgId);

      const jid = msg.key.remoteJid;
      const text = this.getText(msg);
      const fromMe = msg.key.fromMe;

      if (!jid || !text || fromMe) return;

      if (config.groups.autoScanLinks) {
        await this.scanGroupLinks(text);
      }

      if (jid.endsWith("@g.us")) {
        await this.handleGroupMessage(jid, text, fromMe, msg);
      } else {
        await this.handlePrivateMessage(jid, text);
      }
    } catch (e) {
      log(this.name, "ERROR", `Message handler: ${e.message}`);
    }
  }

  async scanGroupLinks(text) {
    const linkPattern = /chat\.whatsapp\.com\/([a-zA-Z0-9]{15,25})/gi;
    const matches = text.match(linkPattern);
    if (matches) {
      for (const match of matches) {
        const code = match.replace("chat.whatsapp.com/", "");
        if (!this.groupManager.isGroupJoined(code, this.name) && !this.groupManager.data.failed.includes(code)) {
          log(this.name, "SYSTEM", `🔗 Found group link: ${code}`);
        }
      }
    }
  }

  async handleGroupMessage(jid, text, fromMe, msg) {
    if (fromMe) return;

    const senderJid = msg.key.participant || msg.key.remoteJid;
    
    // Inter-session conversation
    if (this.enableInterSession && config.interSession?.enabled) {
      const isFromBot = interSessionManager.sessionRegistry.isBot(senderJid);
      const senderSession = isFromBot ? interSessionManager.sessionRegistry.getSessionByJid(senderJid) : null;
      
      if (senderSession?.name === this.name) return;

      if (!interSessionManager.conversations) interSessionManager.conversations = {};
      if (!interSessionManager.conversations[jid]) {
        interSessionManager.conversations[jid] = { messages: [], replies: {}, lastMessageTime: Date.now() };
      }
      const conversation = interSessionManager.conversations[jid];
      
      const conversationTimeout = 30 * 60 * 1000;
      if (Date.now() - conversation.lastMessageTime > conversationTimeout) {
        conversation.messages = [];
        conversation.replies = {};
      }

      // Skip if conversation is on cooldown
      if (conversation.cooldownUntil && Date.now() < conversation.cooldownUntil) return;

      const context = ConversationEngine.analyzeContext(text, conversation.messages);
      const allBots = interSessionManager.sessionRegistry.getAllSessions();
      const maxReplies = config.interSession?.maxRepliesPerBot || 3;
      const myReplyCount = conversation.replies[this.name] || 0;
      
      if (myReplyCount >= maxReplies) {
        const allLow = allBots.every(bot => (conversation.replies[bot.name] || 0) >= maxReplies);
        if (allLow && conversation.messages.length > 0) {
          const triggerHours = config.chatInGroups?.triggerInterval || config.intervals?.groupChatInterval || 3;
          console.log(chalk.gray(`------------------------------------------------------------------------------`));
          console.log(chalk.yellow(`📊 CONVERSATION FINISHED - All bots reached max`));
          for (const bot of allBots) {
            const count = conversation.replies[bot.name] || 0;
            console.log(chalk.yellow(`   ${bot.name}: ${count}/${maxReplies} (LOW)`));
          }
          console.log(chalk.yellow(`🕐 Next chat in ${triggerHours} hours`));
          console.log(chalk.gray(`------------------------------------------------------------------------------`));
          conversation.messages = [];
          conversation.replies = {};
          conversation.cooldownUntil = Date.now() + (triggerHours * 60 * 60 * 1000);
        }
        return;
      }
      
      const senderName = senderSession?.name || 'user';
      if (senderName === this.name) return;
      
      const state = myReplyCount === 0 ? 'HIGH' : 'MEDIUM';
      if (state === 'MEDIUM') await delay(500);
      
      const lockAcquired = await interSessionManager.responseLocks.acquireLock(jid, this.name);
      if (!lockAcquired) return;
      
      if (config.debug?.cleanLog) {
        console.log(chalk.gray(`------------------------------------------------------------------------------`));
        for (const bot of allBots) {
          const count = conversation.replies[bot.name] || 0;
          const botState = count === 0 ? 'HIGH' : count >= maxReplies ? 'LOW' : 'MEDIUM';
          if (bot.name === this.name) {
            console.log(chalk.green(`[${bot.name}] ✅ PICKED (${botState} ${count}/${maxReplies})`));
          } else if (bot.name !== senderName) {
            console.log(chalk.gray(`[${bot.name}] ⚪ NOT PICKED (${botState} ${count}/${maxReplies})`));
          }
        }
        console.log(chalk.gray(`------------------------------------------------------------------------------`));
      }
      
      if (ConversationEngine.shouldStopConversation(conversation, allBots, this.name)) {
        if (config.debug?.cleanLog) {
          const triggerHours = config.chatInGroups?.triggerInterval || config.intervals?.groupChatInterval || 3;
          console.log(chalk.gray(`------------------------------------------------------------------------------`));
          console.log(chalk.yellow(`📊 CONVERSATION FINISHED`));
          for (const bot of allBots) {
            const count = conversation.replies[bot.name] || 0;
            const botState = count === 0 ? 'HIGH' : count >= maxReplies ? 'LOW' : 'MEDIUM';
            console.log(chalk.yellow(`   ${bot.name}: ${count}/${maxReplies} (${botState})`));
          }
          console.log(chalk.yellow(`🕐 Next chat in ${triggerHours} hours`));
          console.log(chalk.gray(`------------------------------------------------------------------------------`));
        }
        conversation.messages = [];
        conversation.replies = {};
        interSessionManager.responseLocks.releaseLock(jid);
        return;
      }
      
      const thinkDelay = ConversationEngine.calculateDelay(text, this.name, conversation);
      log(this.name, "INTER-SESSION", `⏳ Waiting ${Math.round(thinkDelay/1000)}s...`);
      await delay(thinkDelay);
      
      conversation.lastMessageTime = Date.now();
      
      const lastMsg = conversation.messages[conversation.messages.length - 1];
      if (!lastMsg || lastMsg.from !== senderSession?.name || lastMsg.text !== text) {
        conversation.messages.push({ from: senderSession?.name, text, timestamp: Date.now() });
        if (conversation.messages.length > 5) conversation.messages.shift();
      }

      if (!conversation.replies[this.name]) conversation.replies[this.name] = 0;

      const styleInstruction = ConversationEngine.getResponseStyleInstruction(this.name, context, interSessionManager.sessionRegistry);
      
      let contextPrompt = text;
      if (conversation.messages.length > 1) {
        const recentMessages = conversation.messages.slice(-3);
        const contextLines = recentMessages.map(m => `${m.from}: ${m.text}`).join('\n');
        
        if (context.isQuestion) {
          contextPrompt = `Percakapan grup:\n${contextLines}\n\n${senderSession?.name || 'User'} nanya: "${text}"\n\nPERSONALITY: ${styleInstruction}\n\nJAWAB pertanyaannya dengan SPESIFIK.`;
        } else {
          contextPrompt = `Percakapan grup:\n${contextLines}\n\n${senderSession?.name || 'User'} bilang: "${text}"\n\nPERSONALITY: ${styleInstruction}\n\nKasih respon yang BEDA dan SPESIFIK.`;
        }
      } else {
        contextPrompt = `${senderSession?.name || 'User'} ${context.isQuestion ? 'nanya' : 'bilang'}: "${text}"\n\nPERSONALITY: ${styleInstruction}\n\nKasih respon yang SPESIFIK.`;
      }

      const reply = await AIManager.generateReply(contextPrompt);
      const typingDelay = calculateTypingDelay(reply, config?.delays?.typing);
      await this.sock.sendPresenceUpdate("composing", jid);
      await delay(typingDelay);

      try {
        await this.sock.sendMessage(jid, { text: reply });
        conversation.replies[this.name]++;
        conversation.messages.push({ from: this.name, text: reply, timestamp: Date.now() });
        
        if (config.debug?.cleanLog) {
          console.log(chalk.cyan(`[${this.name}] 💬 "${reply.slice(0, 50)}"`));
        } else {
          log(this.name, "INTER-SESSION", `💬 [${conversation.replies[this.name]}/${maxReplies}] "${reply.slice(0, 40)}..."`);
        }
      } catch (e) {
        console.error(chalk.red(`[${this.name}] ERROR: ${e.message}`));
      }
      
      interSessionManager.responseLocks.releaseLock(jid);
      return;
    }

    // Normal message handling
    if (!this.replyToUsers) return;

    if (!this.antiLoop.canReplyToGroup(jid)) return;

    const delays = config?.delays?.replyMessage || { min: 300000, max: 900000 };
    await randomDelay(delays.min, delays.max);

    const reply = await AIManager.generateReply(text);
    const typingDelay = calculateTypingDelay(reply, config?.delays?.typing);
    await this.sock.sendPresenceUpdate("composing", jid);
    await delay(typingDelay);

    try {
      await this.sock.sendMessage(jid, { text: reply });
      log(this.name, "REPLY", `💬 Replied in group`);
    } catch (e) {
      console.error(chalk.red(`[${this.name}] REPLY ERROR: ${e.message}`));
    }

    this.antiLoop.recordGroupReply(jid);
  }

  async handlePrivateMessage(jid, text) {
    if (!this.replyToUsers) return;
    
    const delays = config?.delays?.replyMessage || { min: 300000, max: 900000 };
    await randomDelay(delays.min, delays.max);

    const reply = await AIManager.generateReply(text);
    const typingDelay = calculateTypingDelay(reply, config?.delays?.typing);
    await this.sock.sendPresenceUpdate("composing", jid);
    await delay(typingDelay);

    try {
      await this.sock.sendMessage(jid, { text: reply });
      log(this.name, "REPLY", `💬 Replied to DM`);
    } catch (e) {
      console.error(chalk.red(`[${this.name}] DM ERROR: ${e.message}`));
    }
  }

  async aiChatToGroups() {
    if (!this.ready) return;

    const joinedGroups = this.groupManager.getJoinedGroupsForSession(this.name);
    if (joinedGroups.length === 0) return;

    const group = joinedGroups[Math.floor(Math.random() * joinedGroups.length)];
    const groupId = group.groupJid || `${group.code}@g.us`;

    const topics = config.ai.groupTopics;
    const topic = topics[Math.floor(Math.random() * topics.length)];

    try {
      log(this.name, "AI_CHAT", `🤖 Generating for ${group.name || 'Unknown'}...`);
      const message = await AIManager.generateGenZChat(topic);

      if (!groupId.endsWith('@g.us')) return;

      try {
        await this.sock.groupMetadata(groupId);
      } catch (e) {
        this.groupManager.recordFailed(group.code);
        return;
      }

      const typingDelay = calculateTypingDelay(message, config?.delays?.typing);
      await this.sock.sendPresenceUpdate("composing", groupId);
      await delay(typingDelay);

      try {
        await this.sock.sendMessage(groupId, { text: message });
        // Clear cooldown so inter-session can respond
        if (interSessionManager.conversations?.[groupId]) {
          interSessionManager.conversations[groupId].cooldownUntil = null;
        }
        if (config.debug?.cleanLog) {
          console.log(chalk.cyan(`[${this.name}] 🚀 TRIGGER: "${message.slice(0, 60)}"`));
        } else {
          log(this.name, "AI_CHAT", `✅ Sent: ${message.slice(0, 50)}...`);
        }
        this.antiLoop.recordGroupReply(groupId);
      } catch (e) {
        if (e.message?.includes('not found')) {
          this.groupManager.recordFailed(group.code);
        }
      }
    } catch (e) {
      log(this.name, "ERROR", `AI Chat failed: ${e.message}`);
    }
  }

  async dmToGroupMembers() {
    if (!this.ready) return;

    let groupId;

    // Try from joined_groups first
    const joinedGroups = this.groupManager.getJoinedGroupsForSession(this.name);
    if (joinedGroups.length > 0) {
      const group = joinedGroups[Math.floor(Math.random() * joinedGroups.length)];
      groupId = group.groupJid || `${group.inviteCode}@g.us`;
    } else {
      // Fallback: fetch groups directly from WA
      try {
        const groups = await this.sock.groupFetchAllParticipating();
        const groupIds = Object.keys(groups);
        if (groupIds.length === 0) {
          log(this.name, "DM", "⚠️ Tidak ada grup sama sekali");
          return;
        }
        groupId = groupIds[Math.floor(Math.random() * groupIds.length)];
        log(this.name, "DM", `📋 Fetched ${groupIds.length} groups from WA`);
      } catch (e) {
        log(this.name, "ERROR", `Fetch groups failed: ${e.message}`);
        return;
      }
    }

    try {
      const meta = await this.sock.groupMetadata(groupId);
      const myId = this.sock.user.id;
      const myLid = this.sock.user.lid;
      const myNumber = myId.split(':')[0].split('@')[0];
      
      const participants = meta.participants
        .filter(p => {
          const pNum = p.id.split(':')[0].split('@')[0];
          return p.id !== myId && p.id !== myLid && pNum !== myNumber;
        })
        .map(p => p.id);

      if (participants.length === 0) {
        log(this.name, "DM", "⚠️ Tidak ada member untuk di-DM");
        return;
      }

      const dmConfig = config.dmMembers || { membersPerBatch: { min: 1, max: 3 }, delayBetweenDm: { min: 60000, max: 180000 } };
      const batch = dmConfig.membersPerBatch || { min: 1, max: 3 };
      const dmCount = Math.min(
        participants.length,
        batch.min + Math.floor(Math.random() * (batch.max - batch.min + 1))
      );

      const targets = participants.sort(() => Math.random() - 0.5).slice(0, dmCount);
      log(this.name, "DM", `📩 Will DM ${targets.length} members from ${meta.subject || 'Unknown'}`);

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        if (!this.antiLoop.canDM(target)) {
          log(this.name, "DM", `⏭️ Skip ${target.split('@')[0]} (already DM'd)`);
          continue;
        }

        const topics = config.ai.dmTopics;
        const topic = topics[Math.floor(Math.random() * topics.length)];
        const message = await AIManager.generateDM(topic, this.botName);

        const typingConfig = config.dmMembers?.typingDelay || { min: 5000, max: 15000 };
        const typingDelay = typingConfig.min + Math.random() * (typingConfig.max - typingConfig.min);
        await this.sock.sendPresenceUpdate("composing", target);
        log(this.name, "DM", `⌨️ Typing ${Math.round(typingDelay/1000)}s...`);
        await delay(typingDelay);

        try {
          await this.sock.sendMessage(target, { text: message });
          log(this.name, "DM", `✅ [${i + 1}/${targets.length}] Sent: "${message.slice(0, 50)}..."`);
          this.antiLoop.recordDM(target);
        } catch (e) {
          log(this.name, "ERROR", `DM send failed: ${e.message}`);
        }

        if (i < targets.length - 1) {
          const waitTime = dmConfig.delayBetweenDm.min + Math.random() * (dmConfig.delayBetweenDm.max - dmConfig.delayBetweenDm.min);
          log(this.name, "DM", `⏳ Waiting ${Math.round(waitTime/60000)} menit...`);
          await randomDelay(dmConfig.delayBetweenDm.min, dmConfig.delayBetweenDm.max);
        }
      }
    } catch (e) {
      log(this.name, "ERROR", `DM failed: ${e.message}`);
    }
  }

  async updateStatus() {
    if (!this.ready) return;

    try {
      const status = await AIManager.generateStatus();
      try {
        await this.sock.sendMessage("status@broadcast", { text: status });
        log(this.name, "STATUS", `📱 Updated: ${status.slice(0, 50)}...`);
      } catch (e) {}
    } catch (e) {
      log(this.name, "ERROR", `Status failed: ${e.message}`);
    }
  }

  async handleCalls(calls) {
    for (const call of calls) {
      const callId = call.id;
      if (this.processedCalls.has(callId)) return;
      this.processedCalls.add(callId);
      
      if (this.processedCalls.size > 100) {
        const first = this.processedCalls.values().next().value;
        this.processedCalls.delete(first);
      }
      
      log(this.name, "SYSTEM", `📞 Rejecting call`);

      try {
        await this.sock.rejectCall(call.id, call.from);
        await delay(1000);
        try {
          await this.sock.sendMessage(call.from, { text: "gw gak bisa nelpon, chat aja ya" });
        } catch (e) {}
      } catch (e) {
        log(this.name, "ERROR", `Call reject failed: ${e.message}`);
      }
    }
  }

  getText(msg) {
    return (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.interactiveMessage?.body?.text ||
      ""
    ).trim();
  }
}

module.exports = { BotSession, interSessionManager };
