# ⏱ Flux Time Tracker

Accurately track how much time you spend inside Visual Studio Code —  
with daily, monthly, and per-file-type statistics.

Lightweight. Local. No telemetry.

---

## ✨ Features

- ✅ Tracks total time spent in VS Code
- 📅 Daily statistics
- 📆 Monthly statistics
- 📊 Compare this month vs last month
- 🧩 File type breakdown (e.g. `.ts`, `.js`, `.json`)
- 🪟 Accurate multi-window handling (no duplicate counting)
- 🔒 100% local storage (no external servers)

---

## 🧠 How It Works

- Time is counted **only when a VS Code window is focused**
- If multiple windows are open:
  - Only the focused window is tracked
  - No double-counting
- File-type statistics are recorded based on the active editor
- All data is stored locally using VS Code global storage

No network requests.  
No tracking outside VS Code.  
No background services.

---

## 📊 Available Commands

Open the Command Palette (`Ctrl + Shift + P`) and run:

### • Time Tracker: Show Summary

Displays:

- Today’s time
- Total accumulated time

### • Time Tracker: Compare This Month vs Last

Shows:

- Current month total
- Previous month total
- Difference between them

### • Time Tracker: Top File Types (This Month)

Displays the most used file extensions for the current month  
(e.g. `.ts — 3h 42m`, `.js — 1h 18m`)

### • Time Tracker: Reset Stats

Clears all stored statistics.

---

## 📦 Installation

### Install from VSIX

1. Download the latest `.vsix` file from the GitHub Releases page
2. Open VS Code
3. Go to Extensions
4. Click the `...` menu
5. Select **Install from VSIX...**
6. Choose the downloaded file

Or via terminal:

```bash
code --install-extension flux-time-tracker-x.x.x.vsix
```

## 📁 Data Storage

Statistics are stored locally in VS Code's global storage directory.

- No cloud sync.
- No external database.
- No user data leaves your machine.

## 🔒 Privacy

Flux Time Tracker:

- Does not collect analytics
- Does not send any data
- Does not use telemetry
- Does not track activity outside VS Code

Fully offline.

## 🚀 Roadmap

Planned improvements:

- 📈 Visual dashboard with charts
- 📆 Weekly statistics
- 📤 Export statistics to CSV
- 🔄 Optional sync between devices
- 📊 Status bar live timer
