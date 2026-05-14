// ============================================
// WA-WARMER CONFIG
// ============================================

const cfg = {
  // ============================================
  // 🖥️ SERVER MODE
  // ============================================
  serverPterodactyl: false,         // true = skip menu, langsung start semua enabled sessions

  // ============================================
  // 📱 SESSIONS
  // ============================================
  sessions: [
    { name: "bot1", enabled: true },
    { name: "bot2", enabled: true },
    { name: "bot3", enabled: false },
  ],

  // ============================================
  // 🤖 AI
  // ============================================
  ai: {
    provider: "mistral",           // "google" | "cerebras" | "mistral" | "mix"
    cerebrasModel: "llama3.1-8b",
    mistralModel: "mistral-small-latest",
    googleModels: [
      "gemini-2.0-flash-exp",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-2.5-flash",
    ],
    style: "genz",
    genzPrompt: `Lu anak muda biasa usia 20-an, style:
- Boleh pake "gw/lu" atau "kalian/guys/pada"
- Santai, gak formal, singkat
- Slang kekinian tapi gak berlebihan
- Tanpa emoji
- Natural kayak chat temen beneran`,
    names: [
      "Raka", "Dimas", "Galih", "Bayu", "Rizky", "Fajar", "Aldi", "Yoga",
      "Bima", "Arya", "Kenji", "Rafi", "Zaki", "Naufal", "Adit", "Gilang",
      "Satria", "Vino", "Rama", "Dafa", "Rangga", "Iqbal", "Farel", "Kenzie"
    ],
    groupTopics: ["kerjaan", "hiburan", "makanan", "random_life", "teknologi", "cuaca"],
    dmTopics: ["kenalan", "nanya_kerjaan", "random_chat", "ajak_ngobrol", "curhat", "nanya_pendapat"],
  },

  // ============================================
  // 💬 CHAT IN GROUPS (Inter-Session)
  // ============================================
  chatInGroups: {
    enabled: true,
    maxRepliesPerBot: 3,            // Max reply per bot per conversation
    replyDelay: { min: 5, max: 15 }, // Delay (detik) sebelum bot reply
    triggerInterval: 3,             // Interval (jam) trigger chat baru

    personalityPool: [
      { name: "programmer_serius", style: "technical", chance: 0.7, traits: "suka ngomongin code, bug, deploy, technical stuff", speaking: "formal tapi santai, pake istilah tech" },
      { name: "toxic_receh", style: "chaotic", chance: 0.9, traits: "suka nyinyir, roasting, bercanda toxic tapi friendly", speaking: "receh, sarkastik, banyak emoji 😹😭" },
      { name: "anime_nerd", style: "enthusiast", chance: 0.6, traits: "relate semua ke anime, suka analogi anime arc", speaking: "reference anime, arc, character development" },
      { name: "normie_tongkrongan", style: "casual", chance: 0.8, traits: "biasa aja, gak terlalu niche, relatable", speaking: "santai, everyday talk, gak aneh-aneh" },
      { name: "shitposter", style: "chaotic", chance: 0.9, traits: "random, gak nyambung, brainrot, absurd", speaking: "random banget, typo, lowercase, chaotic" },
      { name: "gamer", style: "enthusiast", chance: 0.7, traits: "relate ke game, rank, meta, grinding", speaking: "istilah game, competitive mindset" },
      { name: "tech_guy", style: "technical", chance: 0.6, traits: "ngerti tech, gadget, software, hardware", speaking: "explain tech stuff, kasih solusi" },
      { name: "silent_watcher", style: "lurker", chance: 0.3, traits: "jarang ngomong, cuma nimbrung penting", speaking: "pendek banget, 1-3 kata, jarang reply" },
      { name: "brainrot_kid", style: "chaotic", chance: 0.9, traits: "terminally online, meme addict, brainrot humor", speaking: "skibidi, sigma, rizz, brainrot slang" },
      { name: "fake_expert", style: "overconfident", chance: 0.8, traits: "sok tau, confident tapi salah, asal ngomong", speaking: "confident, kasih advice random" },
      { name: "motivational_bro", style: "supportive", chance: 0.7, traits: "selalu positif, kasih semangat, supportive", speaking: "motivasi, semangat, lu bisa!" },
      { name: "chaotic_friend", style: "chaotic", chance: 0.9, traits: "unpredictable, random energy, suka bikin chaos", speaking: "random, overreact, capslock kadang" },
      { name: "sleepy_guy", style: "lazy", chance: 0.4, traits: "ngantuk terus, mager, slow response", speaking: "pendek, males ngetik, banyak typo" },
      { name: "lurker", style: "lurker", chance: 0.2, traits: "hampir gak pernah ngomong, cuma baca", speaking: "super pendek, react doang" },
      { name: "overreactor", style: "dramatic", chance: 0.9, traits: "lebay, overreact, dramatisir semua", speaking: "banyak emoji, capslock, exaggerate" },
      { name: "doom_scroller", style: "pessimist", chance: 0.6, traits: "selalu liat sisi negatif, pesimis, doomposting", speaking: "negatif, skeptis, 'udah gitu aja'" },
      { name: "crypto_hustler", style: "hustler", chance: 0.7, traits: "suka ngomongin crypto, investment, side hustle", speaking: "grindset, passive income, hodl" },
      { name: "meme_addict", style: "chaotic", chance: 0.9, traits: "semua dijadiin meme, reference meme terus", speaking: "meme reference, 'real', 'fr fr'" },
      { name: "random_npc", style: "casual", chance: 0.5, traits: "generic friend, gak ada ciri khas khusus", speaking: "biasa aja, standar, gak menonjol" },
      { name: "curious_kid", style: "curious", chance: 0.8, traits: "suka nanya, penasaran, banyak pertanyaan", speaking: "banyak tanya, 'emang kenapa?', 'terus?'" },
    ],
  },

  // ============================================
  // 📥 JOIN GROUPS
  // ============================================
  joinGroups: {
    maxPerSession: 50,
    targetFile: "./data/target_groups.txt",
    joinedFile: "./data/joined_groups.json",
    autoScanLinks: true,
    delay: { min: 2000, max: 5000 },
    checkInterval: 1,               // Interval cek target (jam)
  },

  // ============================================
  // 📩 DM MEMBERS
  // ============================================
  dmMembers: {
    membersPerBatch: { min: 1, max: 3 },            // DM 1-3 orang per bot per batch
    delayBetweenDm: { min: 60000, max: 180000 },    // 1-3 menit antar DM
    typingDelay: { min: 5000, max: 15000 },          // 5-15 detik typing
    interval: 3,                                     // Batch selanjutnya tiap 3 jam
  },

  // ============================================
  // 🟢 ALWAYS ONLINE
  // ============================================
  alwaysOnline: {
    replyDelay: { min: 300000, max: 900000 },
    statusInterval: 3,              // Interval update status (jam)
  },

  // ============================================
  // ⚙️ WA NEW CONFIGURATION
  // ============================================
  waConfig: {
    lastSeenPrivacy: 'none',        // 'all' | 'contacts' | 'contact_blacklist' | 'none'
    readReceiptsPrivacy: 'none',    // 'all' | 'none'
    profilePicFolder: './data/profile_pics',
    profileNames: [
      "Raka Wijaya", "Dimas Pratama", "Galih Setiawan", "Bayu Anggara",
      "Rizky Fauzan", "Fajar Nugroho", "Aldi Firmansyah", "Yoga Pratama",
      "Bima Sakti", "Arya Kusuma", "Kenji Saputra", "Rafi Hidayat",
      "Zaki Ramadhan", "Naufal Aziz", "Adit Wicaksono", "Gilang Permana",
      "Satria Dewa", "Vino Bastian", "Rama Aditya", "Dafa Mahendra",
    ],
    profileStatuses: [
      "hidup mah santai aja", "kerja keras bermain keras",
      "jangan lupa makan", "lagi fokus", "available",
      "kalo mau chat langsung aja", "life is good",
      "ngopi dulu", "grinding mode on", "touch grass",
      "less talk more action", "vibing", "on my way",
      "busy tapi bisa diganggu", "lagi healing",
      "no status needed", "just living", "work hard play hard",
    ],
    stories: [
      "lagi gabut nih", "hari ini produktif bgt", "ngopi dulu",
      "healing time", "grind never stops", "vibing aja",
      "mager level max hari ini", "butuh liburan",
      "kerja terus kapan mainnya", "mood: 📈",
      "hari ini cerah, semangat", "capek tp harus jalan terus",
      "weekend kapan ya", "lagi fokus mode",
      "no drama just vibes", "hidup itu sederhana",
    ],
  },

  // ============================================
  // 🛡️ ANTI-LOOP
  // ============================================
  antiLoop: {
    maxRepliesPerSession: 5,
    maxSessionsPerDay: 3,
    sessionCooldownHours: 4,
    maxDmPerNumberPerDay: 2,
    trackMessages: true,
    historyFile: "./data/chat_history.json",
  },

  // ============================================
  // ⌨️ TYPING (humanized)
  // ============================================
  typing: {
    baseMin: 1000,
    baseMax: 2000,
    perChar: 50,
    maxTotal: 8000,
  },

  // ============================================
  // 🐛 DEBUG
  // ============================================
  debug: {
    cleanLog: true,
    baileys: false,
    ai: false,
    chat: false,
    groups: false,
    interSession: false,
  },

  // ============================================
  // 📝 LOGGING
  // ============================================
  logging: {
    level: "info",
    saveToFile: true,
    logFile: "./logs/bot.log",
  },
};

// ============================================
// BACKWARD COMPAT (jangan diedit)
// ============================================
cfg.groups = { maxPerSession: cfg.joinGroups.maxPerSession, targetFile: cfg.joinGroups.targetFile, joinedFile: cfg.joinGroups.joinedFile, autoScanLinks: cfg.joinGroups.autoScanLinks };
cfg.dm = cfg.dmMembers;
cfg.delays = { joinGroup: cfg.joinGroups.delay, replyMessage: cfg.alwaysOnline.replyDelay, typing: cfg.typing, aiChatDelay: { min: 0, max: 1000 }, dmDelay: cfg.dmMembers.delayBetweenDm };
cfg.intervals = { checkTargetGroups: cfg.joinGroups.checkInterval, groupChatInterval: cfg.chatInGroups.triggerInterval, dmInterval: cfg.dmMembers.interval, statusInterval: cfg.alwaysOnline.statusInterval };
cfg.interSession = { enabled: cfg.chatInGroups.enabled, maxRepliesPerBot: cfg.chatInGroups.maxRepliesPerBot, replyDelay: cfg.chatInGroups.replyDelay, nextChatDelay: cfg.chatInGroups.triggerInterval * 60, personalityPool: cfg.chatInGroups.personalityPool };

module.exports = cfg;
