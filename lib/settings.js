import { ctx, MODULE_NAME } from './st.js';

export const DEFAULT_AI_SYSTEM_PROMPT =
`You are an expert character-card writer for roleplay chats. You write information-dense character definitions, vivid in-character greetings and natural example dialogues.
Conventions: refer to the character by name or as {{char}} and to the player as {{user}}. Never speak or act for {{user}} in greetings. Match the language of the source material unless told otherwise.
Follow the instructions exactly. Output only the requested text, with no preface, no headings, no commentary and no quotation marks around the whole result.`;

export const TONES = [
    { id: 'vivid', label: 'Vivid', hint: 'Richer sensory detail, stronger imagery' },
    { id: 'concise', label: 'Concise', hint: 'Short, punchy and efficient' },
    { id: 'warm', label: 'Warm', hint: 'Friendly, gentle, approachable' },
    { id: 'dark', label: 'Dark', hint: 'Moody, serious, dramatic' },
    { id: 'playful', label: 'Playful', hint: 'Light, witty, mischievous' },
    { id: 'formal', label: 'Formal', hint: 'Measured, elegant, precise' },
    { id: 'casual', label: 'Casual', hint: 'Relaxed, everyday speech' },
    { id: 'poetic', label: 'Poetic', hint: 'Lyrical, flowing, evocative' },
];

export const DEFAULT_SETTINGS = Object.freeze({
    replaceNative: true,
    animations: true,
    icon: 'fa-circle-user',
    accentHue: null,
    lastTab: 'card',
    ai: {
        maxTokens: 0,             // 0 = SillyTavern's response length (thinking models such as Gemini need room)
        greetingLength: 'medium',
        greetingPov: 'third',
        includePersona: true,
        systemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
        language: '',
        wordReveal: true,
    },
    /** @type {Record<string, Array<{id:string, category:string, text:string}>>} */
    traits: {},
    /** @type {Record<string, Array<{ts:number, description:string, label:string}>>} */
    history: {},
});

function deepMerge(target, source) {
    for (const [key, value] of Object.entries(source)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            if (!target[key] || typeof target[key] !== 'object') target[key] = {};
            deepMerge(target[key], value);
        } else if (target[key] === undefined) {
            target[key] = Array.isArray(value) ? [...value] : value;
        }
    }
    return target;
}

/** @returns {typeof DEFAULT_SETTINGS & Record<string, any>} */
export function settings() {
    const all = ctx().extensionSettings;
    if (!all[MODULE_NAME] || typeof all[MODULE_NAME] !== 'object') {
        all[MODULE_NAME] = {};
    }
    return deepMerge(all[MODULE_NAME], structuredClone(DEFAULT_SETTINGS));
}

export function saveSettings() {
    ctx().saveSettingsDebounced();
}

/** Mutate a settings key and persist. */
export function setSetting(path, value) {
    const s = settings();
    const parts = path.split('.');
    let obj = s;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') obj[parts[i]] = {};
        obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    saveSettings();
    return s;
}

const HISTORY_LIMIT = 12;

/** Remember a field version so the user can undo AI edits. Key is `${avatar}::${field}`. */
export function pushHistory(avatarId, description, label = 'Edit') {
    if (!avatarId) return;
    const s = settings();
    const list = s.history[avatarId] ?? (s.history[avatarId] = []);
    const last = list[list.length - 1];
    if (last && last.description === description) return;
    list.push({ ts: Date.now(), description: String(description ?? ''), label });
    while (list.length > HISTORY_LIMIT) list.shift();
    saveSettings();
}

export function getHistory(avatarId) {
    return settings().history[avatarId] ?? [];
}

export function clearHistory(avatarId) {
    const s = settings();
    delete s.history[avatarId];
    saveSettings();
}

/** Remove per-persona data for a persona that no longer exists. */
export function forgetCharacter(avatarId) {
    const s = settings();
    delete s.traits[avatarId];
    for (const key of Object.keys(s.history)) if (key === avatarId || key.startsWith(avatarId + '::')) delete s.history[key];
    saveSettings();
}

/** Copy per-persona data from one id to another (duplicate). */
export function copyCharacterData(fromId, toId) {
    const s = settings();
    if (s.traits[fromId]) s.traits[toId] = structuredClone(s.traits[fromId]);
    saveSettings();
}
