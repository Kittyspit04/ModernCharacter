/**
 * Character card access. Reads come from SillyTavern's in-memory character
 * list (edit mode) or its pending `create_save` object (create mode). Writes
 * go through the native form inputs and SillyTavern's own save path, so
 * every field, event and side effect behaves exactly like the stock editor.
 */
import { ctx, st, events, toast, t } from './st.js';
import { forgetCharacter, copyCharacterData } from './settings.js';

/** Field definitions: native input id, create_save key, reader for a character object. */
export const FIELDS = {
    name: { input: 'character_name_pole', create: 'name', read: c => c.name ?? '', label: 'Name' },
    description: { input: 'description_textarea', create: 'description', read: c => c.description ?? '', label: 'Description' },
    personality: { input: 'personality_textarea', create: 'personality', read: c => c.personality ?? '', label: 'Personality' },
    scenario: { input: 'scenario_pole', create: 'scenario', read: c => c.scenario ?? '', label: 'Scenario' },
    first_mes: { input: 'firstmessage_textarea', create: 'first_message', read: c => c.first_mes ?? '', label: 'First message' },
    mes_example: { input: 'mes_example_textarea', create: 'mes_example', read: c => c.mes_example ?? '', label: 'Example dialogues' },
    creator_notes: { input: 'creator_notes_textarea', create: 'creator_notes', read: c => c.data?.creator_notes ?? c.creatorcomment ?? '', label: 'Creator notes' },
    system_prompt: { input: 'system_prompt_textarea', create: 'system_prompt', read: c => c.data?.system_prompt ?? '', label: 'System prompt override' },
    post_history_instructions: { input: 'post_history_instructions_textarea', create: 'post_history_instructions', read: c => c.data?.post_history_instructions ?? '', label: 'Post-history instructions' },
    creator: { input: 'creator_textarea', create: 'creator', read: c => c.data?.creator ?? '', label: 'Creator' },
    character_version: { input: 'character_version_textarea', create: 'character_version', read: c => c.data?.character_version ?? '', label: 'Version' },
    card_tags: { input: 'tags_textarea', create: 'tags', read: c => Array.isArray(c.data?.tags) ? c.data.tags.join(', ') : '', label: 'Embedded tags' },
    depth_prompt_prompt: { input: 'depth_prompt_prompt', create: 'depth_prompt_prompt', read: c => c.data?.extensions?.depth_prompt?.prompt ?? '', label: 'Character note' },
    depth_prompt_depth: { input: 'depth_prompt_depth', create: 'depth_prompt_depth', read: c => c.data?.extensions?.depth_prompt?.depth ?? st.depth_prompt_depth_default, label: 'Note depth' },
    depth_prompt_role: { input: 'depth_prompt_role', create: 'depth_prompt_role', read: c => c.data?.extensions?.depth_prompt?.role ?? st.depth_prompt_role_default, label: 'Note role' },
    talkativeness: { input: 'talkativeness_slider', create: 'talkativeness', read: c => c.talkativeness ?? st.talkativeness_default, label: 'Talkativeness' },
};

export const TEXT_FIELDS = ['description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'depth_prompt_prompt'];

export function isCreateMode() {
    return ctx().menuType === 'create';
}

export function currentChid() {
    const c = ctx();
    return c.characterId === undefined || c.characterId === null ? null : Number(c.characterId);
}

export function currentCharacter() {
    const chid = currentChid();
    return chid === null ? null : ctx().characters?.[chid] ?? null;
}

/** Stable key for per-card extension data: avatar file name, or 'create' while drafting. */
export function cardKey() {
    if (isCreateMode()) return '__create__';
    return currentCharacter()?.avatar ?? null;
}

/** @typedef {{ mode: 'create'|'edit', chid: number|null, avatar: string|null, fields: Record<string, any>, alternate_greetings: string[], tags: Array<{id:string,name:string,color:string,color2:string}>, world: string, fav: boolean, hasEmbeddedBook: boolean, avatarUrl: string }} CardView */

/** @returns {CardView} */
export function readCard() {
    const c = ctx();
    const create = isCreateMode();
    const fields = {};
    if (create) {
        const cs = c.createCharacterData ?? {};
        for (const [key, def] of Object.entries(FIELDS)) fields[key] = cs[def.create] ?? '';
        const preview = document.getElementById('avatar_load_preview');
        return {
            mode: 'create', chid: null, avatar: null, fields,
            alternate_greetings: Array.isArray(cs.alternate_greetings) ? cs.alternate_greetings : (cs.alternate_greetings = []),
            tags: readListTags(),
            world: cs.world ?? '',
            fav: document.getElementById('fav_checkbox')?.checked ?? false,
            hasEmbeddedBook: false,
            avatarUrl: preview?.getAttribute('src') || st.default_avatar,
        };
    }
    const ch = currentCharacter();
    const chid = currentChid();
    if (!ch) return { mode: 'edit', chid, avatar: null, fields, alternate_greetings: [], tags: [], world: '', fav: false, hasEmbeddedBook: false, avatarUrl: st.default_avatar };
    for (const [key, def] of Object.entries(FIELDS)) fields[key] = def.read(ch);
    if (!ch.data) ch.data = {};
    if (!Array.isArray(ch.data.alternate_greetings)) ch.data.alternate_greetings = [];
    return {
        mode: 'edit', chid, avatar: ch.avatar, fields,
        alternate_greetings: ch.data.alternate_greetings,
        tags: st.getTagsList(ch.avatar),
        world: ch.data?.extensions?.world ?? '',
        fav: ch.fav === true || ch.fav === 'true',
        hasEmbeddedBook: !!ch.data?.character_book,
        avatarUrl: ch.avatar && ch.avatar !== 'none' ? c.getThumbnailUrl('avatar', ch.avatar) : st.default_avatar,
    };
}

/** Tags currently shown in the native create-mode tag list. */
function readListTags() {
    const ids = [...document.querySelectorAll('#tagList .tag')].map(el => el.id).filter(Boolean);
    return ids.map(id => st.tags.find(x => x.id === id)).filter(Boolean);
}

/* ---------------------------------------------------------------- */
/* Writes                                                            */
/* ---------------------------------------------------------------- */

function nativeInput(id) {
    return /** @type {HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|null} */ (document.getElementById(id));
}

/**
 * Set a card field. In edit mode this triggers SillyTavern's debounced save;
 * in create mode it updates the pending draft.
 */
export async function setField(key, value) {
    const def = FIELDS[key];
    if (!def) throw new Error(`Unknown field ${key}`);
    if (key === 'name' && !isCreateMode()) {
        const name = String(value ?? '').trim();
        const ch = currentCharacter();
        if (!name || !ch || name === ch.name) return;
        await st.renameCharacter(name, { silent: true });
        return;
    }
    const el = nativeInput(def.input);
    if (!el) { console.warn('[ModernCharacter] missing native input', def.input); return; }
    el.value = String(value ?? '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (isCreateMode()) {
        const cs = ctx().createCharacterData;
        if (cs) cs[def.create] = ['talkativeness', 'depth_prompt_depth'].includes(key) ? Number(value) : String(value ?? '');
    }
}

/** Save now (edit mode) instead of waiting for the debounce. */
export async function flushSave() {
    if (isCreateMode()) return;
    await st.createOrEditCharacter();
}

/* Alternate greetings */

function greetingsArray() {
    return readCard().alternate_greetings;
}

export function setGreetings(list) {
    const target = greetingsArray();
    target.splice(0, target.length, ...list.map(x => String(x ?? '')));
    if (!isCreateMode()) st.saveCharacterDebounced();
}

export function addGreeting(text = '') {
    const arr = greetingsArray();
    arr.push(String(text));
    if (!isCreateMode()) st.saveCharacterDebounced();
    return arr.length - 1;
}

export function updateGreeting(index, text) {
    const arr = greetingsArray();
    if (index < 0 || index >= arr.length) return;
    arr[index] = String(text ?? '');
    if (!isCreateMode()) st.saveCharacterDebounced();
}

export function removeGreeting(index) {
    const arr = greetingsArray();
    if (index < 0 || index >= arr.length) return;
    arr.splice(index, 1);
    if (!isCreateMode()) st.saveCharacterDebounced();
}

export function moveGreeting(index, direction) {
    const arr = greetingsArray();
    const target = index + direction;
    if (index < 0 || target < 0 || target >= arr.length) return;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    if (!isCreateMode()) st.saveCharacterDebounced();
}

/* Tags (SillyTavern tag system) */

function findTagByName(name) {
    const needle = String(name).trim().toLowerCase();
    return st.tags.find(x => String(x.name).trim().toLowerCase() === needle) ?? null;
}

function createTag(name) {
    const tag = {
        id: ctx().uuidv4(),
        name: String(name).trim(),
        folder_type: 'NONE',
        filter_state: 'UNDEFINED',
        sort_order: Math.max(0, ...st.tags.map(x => Number(x.sort_order) || 0)) + 1,
        is_hidden_on_character_card: false,
        color: '',
        color2: '',
        create_date: Date.now(),
    };
    st.tags.push(tag);
    return tag;
}

export function allTagNames() {
    return [...st.tags].sort((a, b) => String(a.name).localeCompare(String(b.name))).map(x => x.name);
}

export async function addTag(name) {
    const clean = String(name ?? '').trim();
    if (!clean) return false;
    const tag = findTagByName(clean) ?? createTag(clean);
    if (isCreateMode()) {
        if (document.querySelector(`#tagList .tag[id="${CSS.escape(tag.id)}"]`)) return false;
        st.appendTagToList('#tagList', tag, { removable: true });
    } else {
        const key = currentCharacter()?.avatar;
        if (!key) return false;
        if (!Array.isArray(st.tag_map[key])) st.tag_map[key] = [];
        if (st.tag_map[key].includes(tag.id)) return false;
        st.tag_map[key].push(tag.id);
    }
    ctx().saveSettingsDebounced();
    refreshList();
    return true;
}

export async function removeTag(tagId) {
    if (isCreateMode()) {
        document.querySelector(`#tagList .tag[id="${CSS.escape(tagId)}"]`)?.remove();
    } else {
        const key = currentCharacter()?.avatar;
        if (!key) return;
        st.removeTagFromMap(tagId, key);
    }
    ctx().saveSettingsDebounced();
    refreshList();
}

let listTimer = null;
function refreshList() {
    clearTimeout(listTimer);
    listTimer = setTimeout(() => { try { st.printCharacters(false); } catch { /* ignore */ } }, 400);
}

/* Lorebook, favourite, avatar */

export async function setWorld(name) {
    await st.charUpdatePrimaryWorld(String(name ?? ''));
}

export function openAdvancedLorebook() {
    const dd = /** @type {HTMLSelectElement|null} */ (document.getElementById('char-management-dropdown'));
    if (!dd) return;
    dd.value = 'set_character_world';
    dd.dispatchEvent(new Event('change', { bubbles: true }));
}

export function toggleFav() {
    document.getElementById('favorite_button')?.click();
}

/**
 * Hand an image file to the native avatar input. SillyTavern shows its crop
 * dialog, updates the preview and (in edit mode) saves immediately.
 */
export function setAvatarFile(file) {
    const input = /** @type {HTMLInputElement|null} */ (document.getElementById('add_avatar_button'));
    if (!input || !file) return false;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

/* Lifecycle */

export function backToList() {
    document.getElementById('rm_button_characters')?.click();
}

export function openImport() {
    document.getElementById('character_import_button')?.click();
}

export function openExport() {
    document.getElementById('export_button')?.click();
}

export function openNativeAdvanced() {
    document.getElementById('advanced_div')?.querySelector('.menu_button')?.click() ?? document.getElementById('advanced_div')?.click();
}

/** Submit the create form. Resolves with the new character's index, or -1. */
export async function submitCreate() {
    const name = String(ctx().createCharacterData?.name ?? document.getElementById('character_name_pole')?.value ?? '').trim();
    if (!name) throw new Error(t`A name is required`);
    const before = new Set((ctx().characters ?? []).map(x => x.avatar));
    document.getElementById('create_button')?.click();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 200));
        const list = ctx().characters ?? [];
        const index = list.findIndex(x => !before.has(x.avatar) && x.name === name);
        if (index >= 0) return index;
    }
    return -1;
}

export async function openCharacter(index) {
    await ctx().selectCharacterById(index);
}

export async function duplicateCurrent() {
    const ch = currentCharacter();
    if (!ch) return;
    await st.duplicateCharacter({ avatar: ch.avatar, silent: true });
}

export async function deleteCurrent({ deleteChats = false } = {}) {
    const ch = currentCharacter();
    if (!ch) return false;
    const avatar = ch.avatar;
    await st.deleteCharacter(avatar, { deleteChats });
    forgetCharacter(avatar);
    return true;
}

export function tokenCount(text) {
    try { return ctx().getTokenCountAsync(String(text ?? '')); } catch { return Promise.resolve(Math.ceil(String(text ?? '').length / 4)); }
}

export function lorebookNames() {
    try { return ctx().getWorldInfoNames(); } catch { return []; }
}

export function convertToPersona() {
    const dd = /** @type {HTMLSelectElement|null} */ (document.getElementById('char-management-dropdown'));
    if (!dd) return;
    dd.value = 'convert_to_persona';
    dd.dispatchEvent(new Event('change', { bubbles: true }));
}

export { copyCharacterData, events, toast };

export function ctxCharacters() {
    return ctx().characters ?? [];
}
