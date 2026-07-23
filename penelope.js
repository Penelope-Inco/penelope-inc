// =============================================================================
// PENELOPE — Autonomous Chief of Staff Widget for smbello.vercel.app
// =============================================================================
// Key confirmed live and working against Google's API as of this session.
// Split purely to avoid a single contiguous string showing up in a casual
// "view source" — this does NOT hide it from anyone opening devtools/Network
// tab, so still set an HTTP referrer restriction on this key in Google Cloud
// Console > APIs & Services > Credentials, locked to smbello.vercel.app.
const KEY_PART_1 = "AQ.Ab8RN6KwPOcqyX";
const KEY_PART_2 = "5lXWdB7iueLyLkcTIyGbikQf_N4-fuDVgbVQ";
const GEMINI_API_KEY = KEY_PART_1 + KEY_PART_2;

// Primary model + fallback if the primary 404s (model names get deprecated).
const PRIMARY_MODEL = "gemini-3.5-flash";
const FALLBACK_MODEL = "gemini-2.5-flash";

(function () {
    if (window.PenelopeInitialized) return;
    window.PenelopeInitialized = true;

    const loadScript = (src) => new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
    });

    const injectStyles = () => {
        const style = document.createElement('style');
        style.innerHTML = `
            #penelope-widget { position: fixed; bottom: 2rem; left: 1.5rem; z-index: 10000; font-family: 'Inter', sans-serif; }

            /* ── Moon-glass avatar ─────────────────────────────────────────── */
            #penelope-avatar {
                width: 60px; height: 60px; border-radius: 50%;
                background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 60%, rgba(255,255,255,0.02) 100%);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border: 1.5px solid rgba(255,255,255,0.25);
                box-shadow:
                    0 0 0 1px rgba(255,255,255,0.08),
                    0 8px 32px rgba(0,0,0,0.12),
                    0 0 40px rgba(255,255,255,0.06),
                    inset 0 0 16px rgba(255,255,255,0.06);
                display: flex; align-items: center; justify-content: center;
                cursor: pointer;
                transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s ease;
                position: relative; overflow: hidden;
            }
            #penelope-avatar:hover {
                transform: scale(1.08);
                box-shadow:
                    0 0 0 1px rgba(255,255,255,0.15),
                    0 12px 40px rgba(0,0,0,0.18),
                    0 0 50px rgba(255,255,255,0.1),
                    inset 0 0 24px rgba(255,255,255,0.1);
            }

            /* Circular logo — CSS crops the image into the orb */
            #p-avatar-logo {
                width: 44px; height: 44px; border-radius: 50%;
                object-fit: cover;
                object-position: center 25%;
                display: block; position: relative; z-index: 2;
                border: 1.5px solid rgba(255,255,255,0.25);
                background: #fff;
            }

            #p-avatar-close {
                display: none; position: relative; z-index: 2;
                font-size: 1.5rem; color: #fff;
            }

            /* Silver-white pulse instead of blue */
            .penelope-pulse {
                position: absolute; inset: 0; border-radius: 50%;
                background: rgba(255,255,255,0.12);
                box-shadow: 0 0 20px rgba(255,255,255,0.08);
                z-index: -1;
                animation: pPing 2.5s cubic-bezier(0, 0, 0.2, 1) infinite;
            }
            @keyframes pPing { 75%, 100% { transform: scale(1.8); opacity: 0; } }

            /* Custom horizontal tooltip (left-to-right) */
            #p-avatar-tooltip {
                position: absolute;
                left: 72px; top: 50%;
                transform: translateY(-50%) translateX(-8px);
                background: rgba(15, 23, 42, 0.88);
                backdrop-filter: blur(10px);
                color: #fff;
                padding: 8px 14px;
                border-radius: 10px;
                font-size: 0.8rem;
                font-weight: 500;
                white-space: nowrap;
                opacity: 0;
                pointer-events: none;
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                box-shadow: 0 4px 15px rgba(0,0,0,0.25);
                border: 1px solid rgba(255,255,255,0.1);
                z-index: 10;
            }
            #p-avatar-tooltip::before {
                content: '';
                position: absolute;
                right: 100%; top: 50%;
                transform: translateY(-50%);
                border: 6px solid transparent;
                border-right-color: rgba(15, 23, 42, 0.88);
            }
            #penelope-avatar:hover #p-avatar-tooltip {
                opacity: 1;
                transform: translateY(-50%) translateX(0);
            }

            /* Scroll bubble — glassy to match */
            #p-scroll-bubble {
                position: absolute;
                bottom: 72px; left: 72px;
                background: rgba(15, 23, 42, 0.85);
                backdrop-filter: blur(12px);
                color: #fff;
                padding: 10px 16px;
                border-radius: 16px 16px 16px 4px;
                font-size: 0.85rem;
                font-weight: 500;
                line-height: 1.4;
                box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                border: 1px solid rgba(255,255,255,0.12);
                max-width: 220px;
                opacity: 0;
                transform: translateY(10px) scale(0.9);
                pointer-events: none;
                transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
                z-index: 9999;
                cursor: pointer;
            }
            #p-scroll-bubble.show { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }

            #penelope-chatbox { position: absolute; bottom: 80px; left: 0; width: 380px; height: 550px; max-height: 80vh; background: rgba(250, 249, 246, 0.98); backdrop-filter: blur(20px); border: 1px solid rgba(14, 165, 233, 0.2); border-radius: 20px; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15); display: flex; flex-direction: column; overflow: hidden; opacity: 0; transform: translateY(20px) scale(0.95); pointer-events: none; transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); transform-origin: bottom left; }
            #penelope-chatbox.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
            #penelope-chatbox.expanded { width: 90vw; height: 90vh; max-height: 90vh; bottom: -1rem; left: 5vw; border-radius: 24px; }

            #p-header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 1.2rem 1.5rem; display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #0ea5e9; flex-shrink: 0; }
            .p-header-info { display: flex; align-items: center; gap: 0.75rem; }
            .p-header-icon { width: 36px; height: 36px; background: rgba(14, 165, 233, 0.15); border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #0ea5e9; font-size: 1.1rem; }
            .p-header-text h3 { margin: 0; color: #ffffff; font-size: 1rem; font-family: 'Space Grotesk', sans-serif; font-weight: 700; letter-spacing: 0.5px; }
            .p-header-text span { font-size: 0.7rem; color: #10b981; font-family: 'JetBrains Mono', monospace; font-weight: 600; display: flex; align-items: center; gap: 4px; }
            .p-status-dot { width: 6px; height: 6px; background: #10b981; border-radius: 50%; box-shadow: 0 0 8px #10b981; }

            #p-header-actions { display: flex; gap: 15px; }
            #p-header-actions button { background: none; border: none; color: #94a3b8; font-size: 1.1rem; cursor: pointer; transition: color 0.2s; padding: 0; }
            #p-expand:hover { color: #10b981; }
            #p-close:hover { color: #f97316; }

            #p-messages { flex-grow: 1; padding: 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1rem; scrollbar-width: thin; scrollbar-color: rgba(14, 165, 233, 0.3) transparent; }
            #p-messages::-webkit-scrollbar { width: 5px; }
            #p-messages::-webkit-scrollbar-thumb { background: rgba(14, 165, 233, 0.3); border-radius: 5px; }

            .p-msg { max-width: 85%; padding: 14px 18px; font-size: 0.95rem; line-height: 1.6; animation: slideUpFade 0.3s ease-out forwards; opacity: 0; transform: translateY(10px); }
            @keyframes slideUpFade { to { opacity: 1; transform: translateY(0); } }

            .p-msg.bot { align-self: flex-start; background: #ffffff; color: #0f172a; border-radius: 2px 16px 16px 16px; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 4px 12px rgba(0,0,0,0.04); }
            .p-msg.user { align-self: flex-end; background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); color: #ffffff; border-radius: 16px 2px 16px 16px; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.2); }
            .p-msg.error { align-self: center; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; max-width: 100%; }

            .p-msg p { margin: 0 0 8px 0; }
            .p-msg p:last-child { margin: 0; }
            .p-msg h1, .p-msg h2, .p-msg h3 { margin: 0 0 10px 0; font-size: 1.05rem; color: #0ea5e9; }
            .p-msg.bot strong { color: #0284c7; font-weight: 700; }
            .p-msg.user strong { color: #fff; }
            .p-msg ul, .p-msg ol { margin: 0 0 10px 1.5rem; padding: 0; }
            .p-msg li { margin-bottom: 4px; }
            .p-msg a { color: #0ea5e9; }

            .p-typing { display: flex; gap: 4px; align-items: center; padding: 16px; }
            .p-dot { width: 6px; height: 6px; background: #94a3b8; border-radius: 50%; animation: pType 1.4s infinite ease-in-out both; }
            .p-dot:nth-child(1) { animation-delay: -0.32s; }
            .p-dot:nth-child(2) { animation-delay: -0.16s; }
            @keyframes pType { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

            #p-input-area { padding: 1rem; background: #ffffff; border-top: 1px solid rgba(0,0,0,0.05); display: flex; gap: 0.5rem; flex-shrink: 0; }
            #p-input { flex-grow: 1; border: 1px solid rgba(14, 165, 233, 0.2); background: #f8fafc; border-radius: 20px; padding: 0.75rem 1rem; font-family: 'Inter', sans-serif; font-size: 0.9rem; outline: none; transition: border-color 0.3s; color: #0f172a; }
            #p-input:focus { border-color: #0ea5e9; }
            #p-send { width: 42px; height: 42px; border-radius: 50%; background: #0f172a; color: #fff; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.3s; flex-shrink: 0; }
            #p-send:hover { background: #0ea5e9; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3); }

            @media (max-width: 480px) {
                #penelope-widget { bottom: 1.5rem; left: 1rem; }
                #penelope-chatbox { width: calc(100vw - 2rem); height: 60vh; bottom: 70px; left: 0; }
                #penelope-chatbox.expanded { width: 100vw; height: 100vh; max-height: 100vh; bottom: -1.5rem; left: -1rem; border-radius: 0; }
                #p-scroll-bubble { bottom: 72px; left: 0; max-width: 180px; font-size: 0.8rem; }
                #p-avatar-tooltip { display: none; }
            }
        `;
        document.head.appendChild(style);
    };

    const buildDOM = () => {
        const widget = document.createElement('div');
        widget.id = 'penelope-widget';
        widget.innerHTML = `
            <div id="penelope-chatbox">
                <div id="p-header">
                    <div class="p-header-info">
                        <div class="p-header-icon"><i class="fas fa-robot"></i></div>
                        <div class="p-header-text">
                            <h3>Penelope</h3>
                            <span><div class="p-status-dot"></div> Online · Chief of Staff</span>
                        </div>
                    </div>
                    <div id="p-header-actions">
                        <button id="p-expand" title="Expand/Collapse"><i class="fas fa-expand"></i></button>
                        <button id="p-close" title="Close"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                <div id="p-messages">
                    <div class="p-msg bot"><strong>Hello!</strong> I'm Penelope, Mohammed Bello Sani's Chief of Staff. I know his research pipeline, resume, and technical stack, and I can see what's on this page. How can I help?</div>
                </div>
                <div id="p-input-area">
                    <input type="text" id="p-input" placeholder="Ask me about his work..." autocomplete="off">
                    <button id="p-send"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
            <div id="p-scroll-bubble">What do you want to know? I'll help you! 👋</div>
            <div id="penelope-avatar">
                <div class="penelope-pulse"></div>
                <img id="p-avatar-logo" src="/assets/penelope-logo.png" alt="Penelope">
                <i id="p-avatar-close" class="fas fa-times"></i>
                <div id="p-avatar-tooltip">Chat with Penelope</div>
            </div>
        `;
        document.body.appendChild(widget);
    };

    const initLogic = async () => {
        // =====================================================================
        // 🛑 STEP 2: PASTE YOUR THREE EMAILJS IDS 🛑
        // From https://dashboard.emailjs.com/admin
        // =====================================================================
        const EMAILJS_SERVICE_ID = "service_d1k7ewd";
        const EMAILJS_TEMPLATE_ID = "template_8jdi5qd";
        const EMAILJS_PUBLIC_KEY = "9DloHYatGRyjwuntn";

        const CONTACT_WHATSAPP = "+2349067883192";
        const CONTACT_EMAIL = "bellosanidrescue@gmail.com";

        try {
            await Promise.all([
                loadScript("https://cdn.jsdelivr.net/npm/marked/marked.min.js"),
                loadScript("https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js")
            ]);
            if (typeof emailjs !== 'undefined') emailjs.init(EMAILJS_PUBLIC_KEY);
        } catch (e) {
            console.error("Penelope: dependency load failed", e);
        }

        const avatar = document.getElementById('penelope-avatar');
        const avatarLogo = document.getElementById('p-avatar-logo');
        const avatarClose = document.getElementById('p-avatar-close');
        const scrollBubble = document.getElementById('p-scroll-bubble');
        const chatbox = document.getElementById('penelope-chatbox');
        const closeBtn = document.getElementById('p-close');
        const expandBtn = document.getElementById('p-expand');
        const input = document.getElementById('p-input');
        const sendBtn = document.getElementById('p-send');
        const messages = document.getElementById('p-messages');

        let isOpen = false, isExpanded = false, isContactMode = false;
        let chatHistory = [];
        let knowledgeBase = {};

        // Use an absolute path so this works identically whether the widget
        // is loaded from index.html, /about.html, or /stratos-14e/index.html.
        try {
            const res = await fetch('/assets/me.json');
            if (res.ok) knowledgeBase = await res.json();
            else console.warn("Penelope: /assets/me.json returned", res.status);
        } catch (e) {
            console.error("Penelope: could not load /assets/me.json", e);
        }

        // Read whatever page she's currently mounted on, every time she's asked
        // something — not just once at boot — so multi-page navigation stays current.
        const getPageContext = () => document.body.innerText.replace(/\s+/g, ' ').trim().substring(0, 3000);

        const buildSystemPrompt = () => `
You are Penelope, the autonomous Chief of Staff for Mohammed Bello Sani ("SM-Bello"), an aerospace engineer and founder of Penelope Inc.

GROUNDING RULES — follow these exactly:
1. Answer ONLY using facts found in the KNOWLEDGE BASE or the CURRENT PAGE CONTEXT below. Never invent, guess, or infer details about Mohammed that aren't present in that data — no fabricated dates, numbers, schools, or claims.
2. If the answer isn't in either source, say plainly that you don't have that information, then immediately give both contact options: WhatsApp ${CONTACT_WHATSAPP} and email ${CONTACT_EMAIL}. Do not attempt to guess an answer to fill the gap.
3. Never break character or mention that you are Gemini, an AI model, or a language model. You are Penelope.
4. If the user clearly expresses intent to contact, hire, or speak with Mohammed directly, reply with EXACTLY this and nothing else: [TRIGGER_EMAIL_ROUTING]

SCOPE RULE — do not overshoot:
- Answer exactly what was asked, nothing more. If asked for "2 skills," give 2, not a full list. If asked one narrow question about one project, don't append his entire biography or every other project underneath it.
- Only expand beyond the literal question if the user asks something open-ended like "tell me about him" or "give me an overview" — that's the signal for a fuller answer, not a default.
- A short, precise answer to the actual question is always preferred over a comprehensive one nobody asked for.

FORMATTING RULES:
- Always respond in Markdown: use **bold**, bullet points, and headings (##) where useful.
- Never output raw literal "#" symbols as filler or emphasis — only use them as real Markdown heading syntax, which will be rendered, not shown as text.
- Keep answers well-structured and skimmable, not one dense paragraph.

CURRENT PAGE CONTEXT (what the user is currently looking at):
${getPageContext()}

KNOWLEDGE BASE:
${JSON.stringify(knowledgeBase)}
`;

        const toggleChat = () => {
            isOpen = !isOpen;
            chatbox.classList.toggle('open', isOpen);
            avatarLogo.style.display = isOpen ? 'none' : 'block';
            avatarClose.style.display = isOpen ? 'block' : 'none';
            avatarClose.style.color = '#fff';
            if (isOpen) {
                scrollBubble.classList.remove('show');
                setTimeout(() => input.focus(), 300);
            }
        };

        const toggleExpand = () => {
            isExpanded = !isExpanded;
            chatbox.classList.toggle('expanded', isExpanded);
            const icon = expandBtn.querySelector('i');
            icon.classList.toggle('fa-expand', !isExpanded);
            icon.classList.toggle('fa-compress', isExpanded);
        };

        avatar.addEventListener('click', toggleChat);
        closeBtn.addEventListener('click', toggleChat);
        expandBtn.addEventListener('click', toggleExpand);

        // ── Scroll-triggered greeting bubble ─────────────────────────────────
        let scrollEvents = 0;
        let bubbleShown = false;
        let scrollCooldown = false;

        const showScrollBubble = () => {
            if (bubbleShown || isOpen) return;
            bubbleShown = true;
            scrollBubble.classList.add('show');
            setTimeout(() => {
                scrollBubble.classList.remove('show');
            }, 5500);
        };

        window.addEventListener('scroll', () => {
            if (scrollCooldown || bubbleShown || isOpen) return;
            scrollCooldown = true;
            scrollEvents++;
            setTimeout(() => { scrollCooldown = false; }, 700);
            if (scrollEvents >= 2) {
                showScrollBubble();
            }
        }, { passive: true });

        scrollBubble.addEventListener('click', () => {
            scrollBubble.classList.remove('show');
            if (!isOpen) toggleChat();
        });
        // ────────────────────────────────────────────────────────────────────

        const appendMessage = (text, cls, parseMarkdown = false) => {
            const msg = document.createElement('div');
            msg.className = `p-msg ${cls}`;
            msg.innerHTML = parseMarkdown && typeof marked !== 'undefined' ? marked.parse(text) : text;
            messages.appendChild(msg);
            messages.scrollTop = messages.scrollHeight;
        };

        const showTyping = () => {
            const typing = document.createElement('div');
            typing.className = 'p-msg bot p-typing';
            typing.id = 'p-typing-indicator';
            typing.innerHTML = `<div class="p-dot"></div><div class="p-dot"></div><div class="p-dot"></div>`;
            messages.appendChild(typing);
            messages.scrollTop = messages.scrollHeight;
        };

        const removeTyping = () => {
            const typing = document.getElementById('p-typing-indicator');
            if (typing) typing.remove();
        };

        // Set DEBUG_MODE = true only if you need to see a raw Google error
        // inline in the chat again. Off by default now that the key is confirmed working.
        const DEBUG_MODE = false;

        const callGemini = async (model, payload) => {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
                { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
            );
            const data = await response.json();
            if (data.error) {
                const err = new Error(data.error.message || 'Unknown API error');
                err.code = data.error.code;
                err.status = data.error.status;
                err.model = model;
                throw err;
            }
            return data.candidates[0].content.parts[0].text;
        };

        const fetchGeminiResponse = async (userText) => {
            chatHistory.push({ role: "user", parts: [{ text: userText }] });
            const payload = {
                systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
                contents: chatHistory
            };

            try {
                const reply = await callGemini(PRIMARY_MODEL, payload);
                chatHistory.push({ role: "model", parts: [{ text: reply }] });
                return reply;
            } catch (primaryErr) {
                console.error(`Penelope: ${PRIMARY_MODEL} failed`, primaryErr);
                // Only retry the fallback model on a "model not found" style error.
                if (primaryErr.code === 404 || primaryErr.status === 'NOT_FOUND') {
                    try {
                        const reply = await callGemini(FALLBACK_MODEL, payload);
                        chatHistory.push({ role: "model", parts: [{ text: reply }] });
                        return reply;
                    } catch (fallbackErr) {
                        console.error(`Penelope: ${FALLBACK_MODEL} also failed`, fallbackErr);
                        if (DEBUG_MODE) {
                            appendMessage(`DEBUG — ${PRIMARY_MODEL}: ${primaryErr.message}<br>DEBUG — ${FALLBACK_MODEL}: ${fallbackErr.message}`, 'error');
                        }
                    }
                } else if (DEBUG_MODE) {
                    appendMessage(`DEBUG [${primaryErr.status || primaryErr.code || 'ERROR'}]: ${primaryErr.message}`, 'error');
                }
                return `I don't have a working connection right now. Please reach Mohammed directly — WhatsApp **${CONTACT_WHATSAPP}** or email **${CONTACT_EMAIL}**.`;
            }
        };

        const handleSend = async () => {
            const text = input.value.trim();
            if (!text) return;

            appendMessage(text, 'user');
            input.value = '';
            showTyping();

            if (isContactMode) {
                const chatLog = chatHistory.map(m => `${m.role.toUpperCase()}: ${m.parts[0].text}`).join('\n\n');
                try {
                    await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
                        user_email: text,
                        chat_log: chatLog
                    });
                    removeTyping();
                    appendMessage(`**Message sent!** Mohammed will reach out to you at ${text} shortly.`, 'bot', true);
                } catch (error) {
                    console.error("Penelope: EmailJS send failed", error);
                    removeTyping();
                    appendMessage(`I couldn't send that through automatically. Please email him directly at **${CONTACT_EMAIL}** or WhatsApp **${CONTACT_WHATSAPP}**.`, 'bot', true);
                }
                isContactMode = false;
                return;
            }

            const reply = await fetchGeminiResponse(text);
            removeTyping();

            if (reply.trim() === "[TRIGGER_EMAIL_ROUTING]") {
                isContactMode = true;
                appendMessage("I'd be happy to connect you with Mohammed directly. Please reply with your **email address**, and I'll forward this conversation to his inbox.", 'bot', true);
                return;
            }

            appendMessage(reply, 'bot', true);
        };

        sendBtn.addEventListener('click', handleSend);
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
    };

    injectStyles();
    buildDOM();
    initLogic();
    console.log("Penelope Agent initialized.");
})();
