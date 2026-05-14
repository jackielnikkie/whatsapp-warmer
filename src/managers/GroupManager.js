const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const config = require('../../config.js');
const FileManager = require('./FileManager.js');

class GroupManager {
  constructor() {
    // Singleton - return existing instance if exists
    if (GroupManager.instance) {
      return GroupManager.instance;
    }
    
    this.joinedFile = config.groups.joinedFile;
    this.data = FileManager.loadJSON(this.joinedFile, { groups: [], failed: [] });
    this.cleanupDuplicates();
    this.syncWithFileSystem();
    
    GroupManager.instance = this;
  }

  syncWithFileSystem() {
    const sessionsDir = path.join(process.cwd(), 'sessions');
    if (!fs.existsSync(sessionsDir)) return;
    
    const existingSessions = fs.readdirSync(sessionsDir)
      .filter(f => fs.statSync(path.join(sessionsDir, f)).isDirectory() && f.startsWith('bot'));
    
    let changed = false;
    
    for (const group of this.data.groups) {
      const before = group.joinedBy.length;
      group.joinedBy = group.joinedBy.filter(session => existingSessions.includes(session));
      if (group.joinedBy.length !== before) {
        changed = true;
        console.log(chalk.yellow(`[GroupManager] Removed deleted sessions from ${group.name}`));
      }
    }
    
    const beforeCount = this.data.groups.length;
    this.data.groups = this.data.groups.filter(g => g.joinedBy.length > 0);
    
    if (this.data.groups.length !== beforeCount) {
      changed = true;
      console.log(chalk.yellow(`[GroupManager] Removed ${beforeCount - this.data.groups.length} empty groups`));
    }
    
    if (changed) this.save();
  }

  cleanupDuplicates() {
    const seen = new Map();
    const cleaned = [];
    
    for (const group of this.data.groups) {
      const key = group.groupJid || group.inviteCode || group.code;
      if (!key) continue;
      
      if (seen.has(key)) {
        const existing = seen.get(key);
        for (const session of group.joinedBy || []) {
          if (!existing.joinedBy.includes(session)) {
            existing.joinedBy.push(session);
          }
        }
      } else {
        const normalized = {
          inviteCode: group.inviteCode || group.code,
          groupJid: group.groupJid,
          name: group.name || "Unknown",
          joinedBy: group.joinedBy || [],
          discoveredAt: group.discoveredAt || new Date().toISOString()
        };
        seen.set(key, normalized);
        cleaned.push(normalized);
      }
    }
    
    if (this.data.groups.length !== cleaned.length) {
      console.log(chalk.yellow(`[GroupManager] Cleaned ${this.data.groups.length - cleaned.length} duplicate groups`));
      this.data.groups = cleaned;
      this.save();
    }
  }

  save() {
    FileManager.saveJSON(this.joinedFile, this.data);
  }

  getUnjoinedGroups(sessionName) {
    const targets = FileManager.loadTargetGroups();
    return targets.filter(url => {
      const inviteCode = this.extractGroupCode(url);
      if (!inviteCode) return false;
      const group = this.data.groups.find(g => g.inviteCode === inviteCode || g.code === inviteCode);
      return !group || !group.joinedBy.includes(sessionName);
    });
  }

  extractGroupCode(url) {
    const match = url.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]{15,25})/i);
    return match ? match[1] : null;
  }

  isGroupJoined(inviteCode, sessionName) {
    const group = this.data.groups.find(g => g.inviteCode === inviteCode || g.code === inviteCode);
    return group && group.joinedBy.includes(sessionName);
  }

  recordJoin(inviteCode, groupJid, sessionName, groupName = "Unknown") {
    let group = this.data.groups.find(g => g.inviteCode === inviteCode || g.groupJid === groupJid);
    
    if (!group) {
      group = { 
        inviteCode,
        groupJid,
        name: groupName, 
        joinedBy: [], 
        discoveredAt: new Date().toISOString() 
      };
      this.data.groups.push(group);
    } else {
      if (!group.inviteCode) group.inviteCode = inviteCode;
      if (!group.groupJid) group.groupJid = groupJid;
      if (groupName !== "Unknown") group.name = groupName;
    }
    
    if (!group.joinedBy.includes(sessionName)) {
      group.joinedBy.push(sessionName);
    }
    this.save();
  }

  recordLeave(groupJid, sessionName) {
    const group = this.data.groups.find(g => g.groupJid === groupJid);
    if (group && group.joinedBy) {
      group.joinedBy = group.joinedBy.filter(s => s !== sessionName);
      if (group.joinedBy.length === 0) {
        this.data.groups = this.data.groups.filter(g => g.groupJid !== groupJid);
      }
      this.save();
      console.log(chalk.yellow(`[GroupManager] ${sessionName} left ${group.name}`));
    }
  }

  recordFailed(code) {
    if (!this.data.failed.includes(code)) {
      this.data.failed.push(code);
      this.data.groups = this.data.groups.filter(g => g.code !== code);
      this.save();
    }
  }

  getAllJoinedGroups() {
    return this.data.groups;
  }

  getJoinedGroupsForSession(sessionName) {
    return this.data.groups.filter(g => {
      if (!g || !g.joinedBy || !Array.isArray(g.joinedBy)) {
        console.log(chalk.yellow(`[WARN] Group ${g?.code || 'unknown'} has invalid joinedBy field, fixing...`));
        if (g && !g.joinedBy) g.joinedBy = [];
        return false;
      }
      return g.joinedBy.includes(sessionName);
    });
  }

  getJoinedCount(sessionName) {
    return this.getJoinedGroupsForSession(sessionName).length;
  }
}

module.exports = GroupManager;
