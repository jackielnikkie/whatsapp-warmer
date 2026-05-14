# 🤖 Multi-Session WhatsApp Bot

Bot WhatsApp multi-session dengan AI GenZ, auto-join grup, inter-session chat, dan Discord bot integration.

## ✨ Fitur

- **Multi Session** - Jalankan beberapa bot sekaligus
- **Auto Join Group** - Otomatis join grup dari `target_groups.txt`
- **AI Chat GenZ** - Chat dengan gaya santai anak muda
- **Inter-Session Chat** - Bot saling reply di grup biar keliatan natural
- **Auto DM** - Kirim DM ke anggota grup secara random
- **Always Online** - Auto reply + update status/story
- **WA Config** - Auto set profile pic, nama, status, privacy
- **Anti-Loop** - Batasi balasan biar gak spam
- **Discord Bot** - Integrasi bot Discord

## 📁 Struktur

```
├── index.js              # Entry point + menu
├── config.js             # Semua konfigurasi
├── .env.example          # Template environment variables
├── discord/bot/          # Discord bot
├── data/
│   └── target_groups.txt # Link grup target
└── src/
    ├── core/             # BotSession, SessionRegistry, AntiLoop, dll
    ├── managers/         # AI, Group, File, ResponseLock
    ├── modes/            # Fitur: pairing, joinGroups, chatInGroups, dll
    └── utils/            # Helper functions
```

---

## 🖥️ Cara Run di Windows

### 1. Install Node.js

Download dan install dari https://nodejs.org (versi 18+).

Verifikasi:
```cmd
node -v
npm -v
```

### 2. Clone & Install

```cmd
git clone https://github.com/jackielnikkie/whatsapp-warmer.git
cd whatsapp-warmer
npm install
```

### 3. Setup Environment

```cmd
copy .env.example .env
```

Edit `.env` dan isi API key:
```
GOOGLE_API_KEY=xxx
CEREBRAS_API_KEY=xxx
MISTRAL_API_KEY=xxx
DISCORD_TOKEN=xxx
```

### 4. Tambah Link Grup

Edit `data/target_groups.txt`:
```
https://chat.whatsapp.com/KODEGRUP1
https://chat.whatsapp.com/KODEGRUP2
```

### 5. Konfigurasi Session

Edit `config.js` bagian sessions:
```javascript
sessions: [
  { name: "bot1", enabled: true },
  { name: "bot2", enabled: true },
  { name: "bot3", enabled: false },
],
```

### 6. Jalankan

```cmd
node index.js
```

### 7. Pairing

- Pilih mode dari menu yang muncul
- Masukkan nomor WhatsApp (format: `628xxx`)
- Input pairing code yang muncul di WA
- Tunggu sampai "Connected"

---

## 📱 Cara Run di Termux (Android)

### 1. Install Termux

Download dari [F-Droid](https://f-droid.org/packages/com.termux/) (jangan dari Play Store, udah outdated).

### 2. Update & Install Dependencies

```bash
pkg update && pkg upgrade -y
pkg install nodejs git -y
```

### 3. Clone & Install

```bash
git clone https://github.com/jackielnikkie/whatsapp-warmer.git
cd whatsapp-warmer
npm install
```

> ⚠️ Kalau error saat install (sharp/native modules), jalankan:
> ```bash
> pkg install python make g++ -y
> npm install --build-from-source
> ```

### 4. Setup Environment

```bash
cp .env.example .env
nano .env
```

Isi API key, save dengan `Ctrl+X` → `Y` → `Enter`.

### 5. Tambah Link Grup

```bash
nano data/target_groups.txt
```

### 6. Jalankan

```bash
node index.js
```

### 7. Biar Tetap Jalan di Background

Install tmux supaya bot tetap jalan walau Termux ditutup:
```bash
pkg install tmux -y
tmux new -s bot
node index.js
```

Detach: tekan `Ctrl+B` lalu `D`

Re-attach:
```bash
tmux attach -t bot
```

---

## ⚙️ Konfigurasi

Semua konfigurasi ada di `config.js`:

| Section | Fungsi |
|---------|--------|
| `sessions` | Daftar bot yang aktif |
| `ai` | Provider AI (google/cerebras/mistral), style, prompt |
| `chatInGroups` | Inter-session chat settings + personality pool |
| `joinGroups` | Auto join grup settings |
| `dmMembers` | Auto DM settings |
| `alwaysOnline` | Reply delay, status interval |
| `waConfig` | Privacy, profile pic, nama, status |
| `antiLoop` | Rate limiting |
| `debug` | Toggle debug logs |

### AI Provider

```javascript
ai: {
  provider: "mistral",  // "google" | "cerebras" | "mistral" | "mix"
}
```

### Server Mode (tanpa menu)

Set `serverPterodactyl: true` di config untuk langsung start semua enabled sessions tanpa menu interaktif.

---

## 🛑 Stop Bot

Tekan `Ctrl+C`.

## 🔧 Troubleshooting

| Problem | Solusi |
|---------|--------|
| Pairing code gak muncul | Cek format nomor (628xxx), cek internet |
| Gagal join grup | Link expired/penuh, otomatis di-skip |
| AI gak respon | Cek API key di `.env`, cek kuota |
| npm install error di Termux | Install `python make g++` dulu |
| Bot mati pas Termux ditutup | Pakai `tmux` |
