const config = require('../../config');
const FileManager = require('../managers/FileManager');

class AntiLoopManager {
  constructor() {
    this.historyFile = config.antiLoop.historyFile;
    this.data = FileManager.loadJSON(this.historyFile, { groups: {}, dmHistory: {}, processedMessages: [] });
    this.processedMessages = new Set(this.data.processedMessages || []);
  }

  save() {
    this.data.processedMessages = Array.from(this.processedMessages).slice(-1000);
    FileManager.saveJSON(this.historyFile, this.data);
  }

  isMessageProcessed(msgId) {
    return this.processedMessages.has(msgId);
  }

  markMessageProcessed(msgId) {
    this.processedMessages.add(msgId);
    this.save();
  }

  canReplyToGroup(groupId) {
    const group = this.data.groups[groupId];
    if (!group) return true;

    const now = Date.now();
    const lastSession = new Date(group.lastSession || 0).getTime();
    const sessionCooldown = config.antiLoop.sessionCooldownHours * 60 * 60 * 1000;

    if (now - lastSession < sessionCooldown) return false;

    const today = new Date().toDateString();
    if (group.lastSession && new Date(group.lastSession).toDateString() === today) {
      if ((group.sessionsToday || 0) >= config.antiLoop.maxSessionsPerDay) return false;
    }

    return true;
  }

  recordGroupReply(groupId) {
    if (!this.data.groups[groupId]) {
      this.data.groups[groupId] = { sessionsToday: 0, totalReplies: 0, repliedMessageIds: [] };
    }

    const group = this.data.groups[groupId];
    const now = new Date();
    const today = now.toDateString();

    if (group.lastSession && new Date(group.lastSession).toDateString() !== today) {
      group.sessionsToday = 0;
    }

    group.totalReplies = (group.totalReplies || 0) + 1;
    
    if (group.totalReplies >= config.antiLoop.maxRepliesPerSession) {
      group.sessionsToday = (group.sessionsToday || 0) + 1;
      group.lastSession = now.toISOString();
      group.totalReplies = 0;
    }

    this.save();
  }

  canDM(number) {
    const dm = this.data.dmHistory[number];
    if (!dm) return true;

    const now = new Date();
    const today = now.toDateString();
    const lastDmDate = dm.lastDm ? new Date(dm.lastDm).toDateString() : null;

    if (lastDmDate !== today) return true;
    return (dm.countToday || 0) < config.antiLoop.maxDmPerNumberPerDay;
  }

  recordDM(number) {
    if (!this.data.dmHistory[number]) {
      this.data.dmHistory[number] = { countToday: 0, lastDm: null };
    }

    const dm = this.data.dmHistory[number];
    const now = new Date();
    const today = now.toDateString();

    if (dm.lastDm && new Date(dm.lastDm).toDateString() !== today) {
      dm.countToday = 0;
    }

    dm.countToday = (dm.countToday || 0) + 1;
    dm.lastDm = now.toISOString();
    this.save();
  }
}

module.exports = AntiLoopManager;
