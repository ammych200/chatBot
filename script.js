/* ==========================================================
   AI Assistant — Frontend Logic
   ========================================================== */

// ✅ Backend URLs
const API_URL = "http://localhost:5000/chat";
const HEALTH_URL = "http://localhost:5000/health";

/* ==========================================================
   ELEMENTS
   ========================================================== */
const chatBox         = document.getElementById("chat-box");
const userInput       = document.getElementById("user-input");
const sendBtn         = document.getElementById("send-btn");
const themeToggle     = document.getElementById("theme-toggle");
const themeToggleSide = document.getElementById("theme-toggle-side");
const statusEl        = document.getElementById("status");
const welcomeEl       = document.getElementById("welcome");
const micBtn          = document.getElementById("mic-btn");
const attachBtn       = document.getElementById("attach-btn");
const fileInput       = document.getElementById("file-input");
const attachPreview   = document.getElementById("attachment-preview");
const chatListEl      = document.getElementById("chat-list");
const newChatBtn      = document.getElementById("new-chat-btn");
const clearAllBtn     = document.getElementById("clear-all-btn");
const langSelect      = document.getElementById("lang-select");

const sidebar         = document.getElementById("sidebar");
const menuBtn         = document.getElementById("menu-btn");
const collapseBtn     = document.getElementById("collapse-btn");

const settingsBtn     = document.getElementById("settings-btn");
const settingsOverlay = document.getElementById("settings-overlay");
const settingsClose   = document.getElementById("settings-close");
const settingsLang    = document.getElementById("settings-lang");
const settingsTheme   = document.getElementById("settings-theme");
const settingsTTS     = document.getElementById("settings-tts");
const settingsVoiceLang = document.getElementById("settings-voice-lang");
const settingsClear   = document.getElementById("settings-clear");

/* ==========================================================
   STATE
   ========================================================== */
let chats = [];
let activeChatId = null;
let currentAttachments = [];
let isRecording = false;
let recognition = null;

const STORAGE_KEY     = "ai_assistant_chats";
const THEME_KEY       = "ai_assistant_theme";
const LANG_KEY        = "ai_assistant_lang";
const VOICE_LANG_KEY  = "ai_assistant_voice_lang";
const TTS_KEY         = "ai_assistant_tts";

/* ==========================================================
   STORAGE
   ========================================================== */
function loadStorage() {
    try {
        chats = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch { chats = []; }

    const theme = localStorage.getItem(THEME_KEY) || "light";
    if (theme === "dark") document.body.classList.add("dark");
    updateThemeUI();

    const lang = localStorage.getItem(LANG_KEY) || "auto";
    langSelect.value = lang;
    settingsLang.value = lang;

    const vLang = localStorage.getItem(VOICE_LANG_KEY) || "en-US";
    settingsVoiceLang.value = vLang;

    settingsTTS.checked = localStorage.getItem(TTS_KEY) === "true";
}

function saveChats() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function updateThemeUI() {
    const isDark = document.body.classList.contains("dark");
    themeToggle.textContent = isDark ? "☀️" : "🌙";
    themeToggleSide.textContent = isDark ? "☀️ Light Mode" : "🌙 Dark Mode";
    settingsTheme.value = isDark ? "dark" : "light";
}

/* ==========================================================
   THEME
   ========================================================== */
function toggleTheme() {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    updateThemeUI();
}

themeToggle.addEventListener("click", toggleTheme);
themeToggleSide.addEventListener("click", toggleTheme);

settingsTheme.addEventListener("change", () => {
    if (settingsTheme.value === "dark") document.body.classList.add("dark");
    else document.body.classList.remove("dark");
    localStorage.setItem(THEME_KEY, settingsTheme.value);
    updateThemeUI();
});

/* ==========================================================
   LANGUAGE
   ========================================================== */
langSelect.addEventListener("change", () => {
    localStorage.setItem(LANG_KEY, langSelect.value);
    settingsLang.value = langSelect.value;
});

settingsLang.addEventListener("change", () => {
    localStorage.setItem(LANG_KEY, settingsLang.value);
    langSelect.value = settingsLang.value;
});

settingsVoiceLang.addEventListener("change", () => {
    localStorage.setItem(VOICE_LANG_KEY, settingsVoiceLang.value);
    if (recognition) recognition.lang = settingsVoiceLang.value;
});

/* ==========================================================
   SIDEBAR
   ========================================================== */
menuBtn.addEventListener("click", () => sidebar.classList.toggle("open"));
collapseBtn.addEventListener("click", () => sidebar.classList.toggle("collapsed"));

document.addEventListener("click", (e) => {
    if (window.innerWidth <= 768 &&
        sidebar.classList.contains("open") &&
        !sidebar.contains(e.target) &&
        e.target !== menuBtn) {
        sidebar.classList.remove("open");
    }
});

/* ==========================================================
   BACKEND HEALTH
   ========================================================== */
async function checkBackend() {
    try {
        const res = await fetch(HEALTH_URL, { cache: "no-store" });
        const data = await res.json();
        if (data.status === "ok" && data.api_key_loaded) {
            statusEl.textContent = "● Online";
            statusEl.className = "status online";
        } else {
            statusEl.textContent = "● Offline";
            statusEl.className = "status offline";
        }
    } catch {
        statusEl.textContent = "● Offline";
        statusEl.className = "status offline";
    }
}

checkBackend();
setInterval(checkBackend, 10000);

/* ==========================================================
   MARKDOWN (simple renderer)
   ========================================================== */
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function renderMarkdown(text) {
    if (!text) return "";
    let html = escapeHtml(text);

    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
        return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Bullet list
    html = html.replace(/(?:^|\n)[-*]\s+(.+)/g, "\n<li>$1</li>");
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, (m) => `<ul>${m}</ul>`);
    // Merge consecutive <ul>
    html = html.replace(/<\/ul>\s*<ul>/g, "");

    // Paragraphs
    html = html.split(/\n\n+/).map(p => {
        if (p.trim().startsWith("<ul>") || p.trim().startsWith("<pre>")) return p;
        return `<p>${p.replace(/\n/g, "<br>")}</p>`;
    }).join("");

    return html;
}

/* ==========================================================
   CHAT MANAGEMENT
   ========================================================== */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function createNewChat() {
    const chat = {
        id: generateId(),
        title: "New Chat",
        messages: [],
        createdAt: Date.now()
    };
    chats.unshift(chat);
    activeChatId = chat.id;
    saveChats();
    renderChatList();
    clearChatUI();
    return chat;
}

function getActiveChat() {
    return chats.find(c => c.id === activeChatId);
}

function clearChatUI() {
    // Remove all message elements, keep welcome
    const messages = chatBox.querySelectorAll(".message, .typing-text");
    messages.forEach(m => m.remove());
    if (welcomeEl) welcomeEl.style.display = "block";
}

function renderChatList() {
    chatListEl.innerHTML = "";
    if (chats.length === 0) {
        chatListEl.innerHTML = `<div style="padding:12px;font-size:13px;color:var(--muted);text-align:center;">No chats yet</div>`;
        return;
    }

    chats.forEach(chat => {
        const item = document.createElement("div");
        item.className = "chat-item" + (chat.id === activeChatId ? " active" : "");
        item.innerHTML = `
            <span class="chat-item-title">${escapeHtml(chat.title)}</span>
            <button class="chat-item-del" title="Delete">✕</button>
        `;

        item.addEventListener("click", (e) => {
            if (e.target.classList.contains("chat-item-del")) return;
            openChat(chat.id);
        });

        item.querySelector(".chat-item-del").addEventListener("click", (e) => {
            e.stopPropagation();
            deleteChat(chat.id);
        });

        chatListEl.appendChild(item);
    });
}

function openChat(id) {
    activeChatId = id;
    const chat = getActiveChat();
    if (!chat) return;

    clearChatUI();
    if (welcomeEl) welcomeEl.style.display = "none";

    chat.messages.forEach(msg => renderMessage(msg.role, msg.content, false));

    renderChatList();
    scrollToBottom();

    if (window.innerWidth <= 768) sidebar.classList.remove("open");
}

function deleteChat(id) {
    chats = chats.filter(c => c.id !== id);
    if (activeChatId === id) {
        activeChatId = chats.length ? chats[0].id : null;
        if (activeChatId) openChat(activeChatId);
        else { clearChatUI(); if (welcomeEl) welcomeEl.style.display = "block"; }
    }
    saveChats();
    renderChatList();
}

function deleteAllChats() {
    if (!confirm("Delete ALL chat history? This cannot be undone.")) return;
    chats = [];
    activeChatId = null;
    saveChats();
    renderChatList();
    clearChatUI();
    if (welcomeEl) welcomeEl.style.display = "block";
}

newChatBtn.addEventListener("click", () => {
    createNewChat();
    if (window.innerWidth <= 768) sidebar.classList.remove("open");
});

clearAllBtn.addEventListener("click", deleteAllChats);
settingsClear.addEventListener("click", () => {
    deleteAllChats();
    closeSettings();
});

/* ==========================================================
   MESSAGES RENDERING
   ========================================================== */
function scrollToBottom() {
    chatBox.scrollTop = chatBox.scrollHeight;
}

function renderMessage(role, content, animate = true) {
    if (welcomeEl) welcomeEl.style.display = "none";

    const msgDiv = document.createElement("div");
    msgDiv.className = "message " + (role === "user" ? "user" : "bot");
    if (!animate) msgDiv.style.animation = "none";

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = role === "user" ? "🧑" : "🤖";

    const contentWrap = document.createElement("div");
    contentWrap.className = "msg-content";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    if (role === "bot") {
        bubble.innerHTML = renderMarkdown(content);
    } else {
        bubble.textContent = content;
    }
    contentWrap.appendChild(bubble);

    // Bot actions
    if (role === "bot") {
        const actions = document.createElement("div");
        actions.className = "msg-actions";
        actions.innerHTML = `
            <button class="msg-action-btn" data-act="copy" title="Copy">📋</button>
            <button class="msg-action-btn" data-act="regen" title="Regenerate">🔄</button>
            <button class="msg-action-btn" data-act="read" title="Read aloud">🔊</button>
            <button class="msg-action-btn" data-act="like" title="Like">👍</button>
            <button class="msg-action-btn" data-act="dislike" title="Dislike">👎</button>
        `;

        actions.addEventListener("click", (e) => {
            const btn = e.target.closest(".msg-action-btn");
            if (!btn) return;
            const act = btn.dataset.act;

            if (act === "copy") {
                navigator.clipboard.writeText(content);
                btn.textContent = "✅";
                setTimeout(() => (btn.textContent = "📋"), 1500);
            }
            if (act === "read") speakText(content);
            if (act === "like" || act === "dislike") {
                actions.querySelectorAll('[data-act="like"],[data-act="dislike"]')
                    .forEach(b => b.classList.remove("active"));
                btn.classList.add("active");
            }
            if (act === "regen") regenerateResponse();
        });

        contentWrap.appendChild(actions);
    }

    msgDiv.appendChild(avatar);
    msgDiv.appendChild(contentWrap);
    chatBox.appendChild(msgDiv);
    scrollToBottom();

    // Auto-TTS for bot messages
    if (role === "bot" && settingsTTS.checked) speakText(content);

    return msgDiv;
}

function showTyping() {
    const wrap = document.createElement("div");
    wrap.className = "typing-text";
    wrap.id = "typing-text";
    wrap.textContent = "AI is thinking...";
    chatBox.appendChild(wrap);

    const msgDiv = document.createElement("div");
    msgDiv.className = "message bot typing";
    msgDiv.id = "typing-indicator";

    const avatar = document.createElement("div");
    avatar.className = "msg-avatar";
    avatar.textContent = "🤖";

    const contentWrap = document.createElement("div");
    contentWrap.className = "msg-content";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = `<span class="dot"></span><span class="dot"></span><span class="dot"></span>`;

    contentWrap.appendChild(bubble);
    msgDiv.appendChild(avatar);
    msgDiv.appendChild(contentWrap);
    chatBox.appendChild(msgDiv);
    scrollToBottom();
}

function hideTyping() {
    document.getElementById("typing-indicator")?.remove();
    document.getElementById("typing-text")?.remove();
}

/* ==========================================================
   SEND MESSAGE
   ========================================================== */
async function sendMessage(customText = null) {
    const message = (customText ?? userInput.value).trim();
    if (!message && currentAttachments.length === 0) return;

    // Ensure active chat exists
    if (!activeChatId) createNewChat();
    const chat = getActiveChat();
    if (!chat) return;

    // Add user message
    const userText = message + (currentAttachments.length
        ? `\n📎 ${currentAttachments.map(a => a.name).join(", ")}`
        : "");

    renderMessage("user", userText);
    chat.messages.push({ role: "user", content: message });

    // Set title from first message
    if (chat.title === "New Chat" && message) {
        chat.title = message.slice(0, 40) + (message.length > 40 ? "..." : "");
        renderChatList();
    }

    saveChats();

    // Reset input
    userInput.value = "";
    userInput.style.height = "auto";
    currentAttachments = [];
    renderAttachments();

    // Send to backend
    sendBtn.disabled = true;
    showTyping();

    try {
        const history = chat.messages.slice(-10).map(m => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: m.content
        }));
        // Remove the last message (we send it separately as "message")
        history.pop();

        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message,
                language: langSelect.value,
                history
            })
        });

        const data = await res.json();
        hideTyping();

        if (!res.ok) {
            renderMessage("bot", "Sorry, I couldn't connect to the AI. Please try again.");
        } else {
            renderMessage("bot", data.reply || "No reply received.");
            chat.messages.push({ role: "assistant", content: data.reply || "" });
            saveChats();
        }
    } catch (err) {
        hideTyping();
        renderMessage("bot", "Sorry, I couldn't connect to the AI. Please try again.");
        console.error(err);
    } finally {
        sendBtn.disabled = false;
        userInput.focus();
    }
}

function regenerateResponse() {
    const chat = getActiveChat();
    if (!chat || chat.messages.length < 2) return;

    // Remove last assistant message
    if (chat.messages[chat.messages.length - 1].role === "assistant") {
        chat.messages.pop();
    }

    // Find last user message
    const lastUser = [...chat.messages].reverse().find(m => m.role === "user");
    if (!lastUser) return;

    saveChats();

    // Remove last bot bubble from UI
    const botMessages = chatBox.querySelectorAll(".message.bot:not(.typing)");
    if (botMessages.length) botMessages[botMessages.length - 1].remove();

    sendMessage(lastUser.content);
}

sendBtn.addEventListener("click", () => sendMessage());

userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto-expand textarea
userInput.addEventListener("input", () => {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 150) + "px";
});

/* ==========================================================
   SUGGESTION CARDS
   ========================================================== */
document.querySelectorAll(".suggestion-card").forEach(card => {
    card.addEventListener("click", () => {
        userInput.value = card.dataset.prompt;
        sendMessage();
    });
});

/* ==========================================================
   VOICE INPUT
   ========================================================== */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (!SpeechRecognition) {
    micBtn.disabled = true;
    micBtn.title = "Voice not supported in this browser";
    micBtn.style.opacity = "0.4";
} else {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = settingsVoiceLang.value;

    recognition.onstart = () => {
        isRecording = true;
        micBtn.classList.add("recording");
        micBtn.textContent = "🔴";
    };

    recognition.onend = () => {
        isRecording = false;
        micBtn.classList.remove("recording");
        micBtn.textContent = "🎤";
    };

    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        userInput.value = transcript;
        userInput.focus();
    };

    recognition.onerror = (e) => {
        console.error("Speech error:", e.error);
        if (e.error === "not-allowed") {
            renderMessage("bot", "🎤 Mic permission denied. Please allow mic access in browser settings.");
        }
    };
}

micBtn.addEventListener("click", () => {
    if (!recognition) return;
    if (isRecording) recognition.stop();
    else {
        recognition.lang = settingsVoiceLang.value;
        try { recognition.start(); } catch (e) { console.error(e); }
    }
});

/* ==========================================================
   TEXT-TO-SPEECH
   ========================================================== */
let currentUtterance = null;

function speakText(text) {
    if (!("speechSynthesis" in window)) return;

    // Stop if already speaking
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
        if (currentUtterance && currentUtterance.text === text) {
            currentUtterance = null;
            return;
        }
    }

    // Strip markdown
    const clean = text
        .replace(/```[\s\S]*?```/g, " code block ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/[-*]\s+/g, "")
        .replace(/\n+/g, ". ");

    const u = new SpeechSynthesisUtterance(clean);
    u.lang = settingsVoiceLang.value;
    u.rate = 1;
    u.pitch = 1;
    currentUtterance = u;
    u.text = text;

    window.speechSynthesis.speak(u);
}

settingsTTS.addEventListener("change", () => {
    localStorage.setItem(TTS_KEY, settingsTTS.checked);
});

/* ==========================================================
   FILE ATTACHMENTS
   ========================================================== */
attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files);
    files.forEach(f => {
        currentAttachments.push({ name: f.name, type: f.type, file: f });
    });
    fileInput.value = "";
    renderAttachments();
});

function renderAttachments() {
    attachPreview.innerHTML = "";
    currentAttachments.forEach((att, i) => {
        const chip = document.createElement("div");
        chip.className = "attachment-chip";

        if (att.type.startsWith("image/")) {
            const img = document.createElement("img");
            const reader = new FileReader();
            reader.onload = (e) => (img.src = e.target.result);
            reader.readAsDataURL(att.file);
            chip.appendChild(img);
        } else {
            const icon = document.createElement("span");
            icon.textContent = "📄";
            chip.appendChild(icon);
        }

        const name = document.createElement("span");
        name.textContent = att.name.length > 20 ? att.name.slice(0, 18) + "..." : att.name;
        chip.appendChild(name);

        const rm = document.createElement("button");
        rm.className = "remove";
        rm.textContent = "✕";
        rm.addEventListener("click", () => {
            currentAttachments.splice(i, 1);
            renderAttachments();
        });
        chip.appendChild(rm);

        attachPreview.appendChild(chip);
    });
}

/* ==========================================================
   SETTINGS PANEL
   ========================================================== */
settingsBtn.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettings();
});

function openSettings() { settingsOverlay.classList.add("active"); }
function closeSettings() { settingsOverlay.classList.remove("active"); }

/* ==========================================================
   INIT
   ========================================================== */
function init() {
    loadStorage();

    // If there are chats, open the latest
    if (chats.length > 0) {
        activeChatId = chats[0].id;
        openChat(activeChatId);
    } else {
        // Show welcome only
        renderChatList();
        if (welcomeEl) welcomeEl.style.display = "block";
    }
}

init();