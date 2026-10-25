# SABIS KILLER v1.5 - Chrome Extension (Manifest V3)

A minimal screen-capture academic assistant overlay for Google Chrome supporting multiple AI providers (**Google Gemini**, **OpenAI**, **Anthropic**, **DeepSeek**, and **OpenRouter**) with dynamic model selection and automatic 429 quota failover routing.

---

## Features

- **Multi-Provider AI Architecture**:
  - **Google Gemini**: Auto (Free), Auto (Free + Paid), and manual models (`gemini-4-argon`, `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-3.8-live`).
  - **OpenAI**: Auto (Free), Auto (Free + Paid) with 429 failover to `gpt-5.4-mini`, and manual models (`gpt-5.5`, `gpt-5.5-pro`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.4-nano`, `o3`, `o3-pro`, `o4-mini`, `gpt-4o`).
  - **Anthropic**: Auto (Free + Paid) with 429 failover to `claude-sonnet-5.5`, and manual models (`claude-fable-5.1`, `claude-opus-5.5`, `claude-sonnet-5.5`, `claude-haiku-5.5`, `claude-sonnet-5`, `claude-opus-4.8`).
  - **DeepSeek**: Auto (Free), Auto (Free + Paid) with 429 failover to `deepseek-v4-flash`, and manual models (`deepseek-v4-pro`, `deepseek-v4-flash`).
  - **OpenRouter**: Auto (Free), Auto (Free + Paid) with failover to free variants, and manual models (`openrouter/auto`, `openrouter/free`, `deepseek/deepseek-r1:free`, `meta-llama/llama-3.3-70b-instruct:free`, `qwen/qwq-32b:free`, `google/gemini-2.5-flash:free`).

- **Smart Failover Routing**:
  - Automatically catches HTTP `429 Too Many Requests`, quota exhaustion, or credit limits on flagship models and retries seamlessly with provider-designated free/flash models.

- **Floating Capture Button & Custom Prompt Bar**:
  - Clean circular button in the bottom-right corner.
  - Optional custom instruction input field positioned directly adjacent to the capture button.
  - Customizable colors, dimensions, and font sizes.

- **Non-Intrusive Answer Display**:
  - Formatted into the bottom bar section of the page. Renders multi-part answers cleanly without obstructing content.

- **Hidden Bottom-Left Toggle Zone**:
  - Invisible 2% &times; 2% click target in the exact bottom-left corner to show/hide the entire overlay.

---

## Project Structure

```text
├── manifest.json       # Manifest V3 configuration with activeTab, tabs, storage & host permissions
├── background.js      # Service worker: multi-provider router & smart failover capture
├── content.js         # Injected overlay (Shadow DOM isolated): button, display & hidden toggle
├── popup.html         # Multi-provider settings UI with dynamic model dropdowns
├── popup.css          # Styling for popup
├── popup.js           # Multi-key persistence, provider switching & connection testing
├── icons/             # Extension icons (16x16, 48x48, 128x128)
└── README.md          # Documentation & setup instructions
```

---

## Installation & Setup

1. **Open Chrome Extension Management**:
   - In Google Chrome, navigate to `chrome://extensions/`.
2. **Enable Developer Mode**:
   - Turn on the **Developer mode** toggle in the top-right corner.
3. **Load the Extension**:
   - Click **Load unpacked** in the top-left corner.
   - Select the workspace folder (`./`).
4. **Configure Your Preferred Provider**:
   - Click the extension icon in the Chrome toolbar.
   - Click any provider button (`[Use Google]`, `[Use OpenAI]`, `[Use Anthropic]`, `[Use DeepSeek]`, `[Use OpenRouter]`).
   - Enter your API key and choose your model/failover strategy.
   - Click **Save Settings** or **Test Connection**.

---

## How to Use

1. **Analyze Questions on Screen**:
   - Navigate to any quiz or academic page.
   - Type optional instructions into the prompt bar (or leave blank).
   - Click the circular button in the bottom-right corner (or press Enter in the prompt bar).
   - The concise answer appears in the bottom display area.
2. **Hide/Show the Interface**:
   - Click the invisible 2% &times; 2% zone in the exact **bottom-left** corner of the screen.
