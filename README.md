# 🖐️ LazyFingers: The Ultimate CRM Automation Tool 🚀

> **"Why click when you can code?"**  
> Automate your repetitive web tasks with style, precision, and zero effort.

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Version](https://img.shields.io/badge/version-1.0.0-green.svg) ![Vibe](https://img.shields.io/badge/vibe-chill-purple.svg)

---

## 🌟 What is LazyFingers?

**LazyFingers** is a powerful, lightweight Chrome Extension designed to automate complex workflows on any CRM or web application. It records your actions, allows you to edit them on the fly, and replays them with perfect timing.

Whether you're filling out forms, clicking through endless menus, or scheduling tasks for later, LazyFingers has got your back.

### ✨ Key Features

*   **🔴 Record & Replay**: Capture your clicks and inputs, then save them as reusable JSON flows.
*   **⚡ Speed Control**: Inline "Speed Up" / "Slow Down" controls. Adjust timing per step or in bulk!
*   **📅 Scheduling**: Set a timer and let the bot run the task while you grab a coffee ☕.
*   **🛠️ Edit on the Fly**: Tweak values, delays, and logic directly in the UI without touching code.
*   **📂 Save & Load**: Export your favorite workflows to JSON and share them with your team.
*   **🛑 Tab Isolation**: Run different flows in different tabs simultaneously without conflicts.

---

## 🚀 Getting Started

### 📥 Installation

1.  **Clone this repository**:
    ```bash
    git clone https://github.com/yourusername/LazyFingers.git
    ```
2.  Open **Google Chrome** and go to `chrome://extensions`.
3.  Enable **Developer Mode** (toggle in the top-right corner).
4.  Click **Load unpacked** and select the `crm_automation_ext` folder from this project.
5.  Navigate to your target website, and you'll see the **LazyFingers Panel** appear!

### 🎮 How to Use

#### 1. The Panel
You'll see a sleek dark-mode panel in the bottom right of your screen.
*   **🔴 Rec**: Start recording your actions.
*   **▶ Run Now**: Execute the currently loaded flow.
*   **📅 Schedule**: Pick a time to run the task automatically.

#### 2. Recording a Flow
1.  Click **🔴 Rec**.
2.  Perform your task naturally (click, type, select).
3.  Click **⏹ Stop** when done.
4.  Your flow is saved! You can run it immediately or export it.

#### 3. Editing Steps
*   Click **▼ Steps** to expand the step list.
*   **Double-click** any value to edit it (e.g., change text input).
*   Use the **Speed** controls to adjust delays (milliseconds).
*   **Bulk Select** steps to speed up or slow down entire sections at once.

---

## 📂 Project Structure

```text
projectRL/
├── crm_automation_ext/   # 🧩 The core extension source code
│   ├── manifest.json     # Extension configuration (V3)
│   ├── content.js        # 🧠 The brain: Logic, UI, and Automation engine
│   ├── background.js     # Service worker
│   ├── popup.html        # Extension popup UI
│   └── ...
├── run_crm_task.bat      # ⚡ Quick-start batch script for Windows
└── README.md             # 📖 You are here!
```

---

## 🛠️ Tech Stack

*   **Vanilla JavaScript (ES6+)**: No frameworks, no bloat. Pure performance.
*   **Chrome Extension API (Manifest V3)**: Future-proof and secure.
*   **HTML5/CSS3**: Custom injected UI with shadow DOM-like isolation.

---

## 🤝 Contributing

Got a cool idea? Found a bug?
1.  Fork it 🍴
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request 📩

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.

---

> Built with ❤️ by **[Your Name/Team]**  
> *Automating the boring stuff so you can focus on the fun stuff.*
