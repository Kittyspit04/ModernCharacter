/**
 * The Modern Character editor panel. Lives inside SillyTavern's right
 * navigation drawer in place of the stock character form.
 */
import { h, icon, button, iconButton, chip, toggle, segmented, field, input, textarea, select as selectEl, clear, stagger, flash, debounce, confirm, promptText, toastOk, toastWarn, toastErr, empty, motionEnabled } from './dom.js';
import { aiReview, traitEditor, historyList } from './components.js';
import { openCreateWizard, openRefineWizard, openInterviewWizard } from './wizards.js';
import * as card from '../lib/card.js';
import * as ai from '../lib/ai.js';
import { settings, setSetting, pushHistory, getHistory, TONES, DEFAULT_AI_SYSTEM_PROMPT } from '../lib/settings.js';
import { getTraits, setTraits, compileTraits, CATEGORIES } from '../lib/traits.js';
import { events, t } from '../lib/st.js';

const TABS = [
    { value: 'card', label: t`Card`, icon: 'id-card' },
    { value: 'greetings', label: t`Greetings`, icon: 'comment-dots' },
    { value: 'traits', label: t`Traits`, icon: 'tags' },
    { value: 'ai', label: t`AI`, icon: 'wand-magic-sparkles' },
    { value: 'advanced', label: t`Advanced`, icon: 'sliders' },
    { value: 'settings', label: t`Settings`, icon: 'gear' },
];

const GREETING_LENGTHS = [{ value: 'short', label: t`Short` }, { value: 'medium', label: t`Medium` }, { value: 'long', label: t`Long` }, { value: 'epic', label: t`Epic` }];
const POVS = [{ value: 'third', label: t`Third person` }, { value: 'second', label: t`“You”` }, { value: 'first', label: t`First person` }];

export function createPanel(root) {
    const state = { tab: settings().lastTab || 'card', renderedKey: null, writing: 0 };
    const app = h('div.mc-app');
    root.append(app);
    /** @type {Map<string, HTMLTextAreaElement|HTMLInputElement>} */
    const bound = new Map();
    let tabs = null;
    let tabPanel = null;
    let hero = null;

    function key() { const v = card.readCard(); return `${v.mode}:${v.avatar ?? 'new'}`; }
    function historyKey(v, fieldKey) { return `${v.avatar ?? '__create__'}::${fieldKey}`; }

    /* ---------------------------------------------------------------- */
    /* Render                                                           */
    /* ---------------------------------------------------------------- */
    function render() {
        clear(app);
        bound.clear();
        const v = card.readCard();
        if (v.mode === 'edit' && v.chid === null) {
            app.append(empty({ icon: 'address-card', title: t`No character selected`, hint: t`Pick one from the list or create a new one.`, action: button({ label: t`New character`, icon: 'plus', kind: 'primary', onClick: () => startCreate() }) }));
            return;
        }
        app.append(renderTopbar(v));
        hero = renderHero(v);
        app.append(hero);
        tabs = segmented({ options: TABS, value: state.tab, className: 'mc-tabs', onChange: (tab) => { state.tab = tab; setSetting('lastTab', tab); renderTab(); } });
        tabPanel = h('div.mc-tabpanel');
        app.append(tabs, tabPanel);
        if (v.mode === 'create') app.append(renderCreateBar());
        renderTab();
        state.renderedKey = key();
    }

    function renderTopbar(v) {
        return h('div.mc-topbar', null,
            iconButton({ icon: 'arrow-left', label: t`Back to characters`, onClick: () => card.backToList() }),
            h('div.mc-brand', null, h('span.mc-brand-icon', null, icon(v.mode === 'create' ? 'user-plus' : 'address-card')), h('span.mc-brand-text', null, v.mode === 'create' ? t`New character` : t`Character`)),
            h('div.mc-topbar-tools', null,
                v.mode === 'create' ? button({ label: t`Wizard`, icon: 'wand-magic-sparkles', kind: 'accent', small: true, onClick: () => openCreateWizard({}) }) : null,
                v.mode === 'edit' ? button({ label: t`New`, icon: 'plus', kind: 'primary', small: true, className: 'mc-new-btn', onClick: (ev) => popMenu(ev.currentTarget, [
                    { icon: 'wand-magic-sparkles', label: t`Guided wizard`, hint: t`Concept, traits, card, greetings, examples`, onClick: () => startCreate(true) },
                    { icon: 'bolt', label: t`Blank character`, hint: t`Opens the empty editor`, onClick: () => startCreate(false) },
                    { icon: 'file-import', label: t`Import from file`, hint: t`PNG, JSON or a URL`, onClick: () => card.openImport() },
                ]) }) : null,
            ),
        );
    }

    function startCreate(withWizard = true) {
        document.getElementById('rm_button_create')?.click();
        if (withWizard) setTimeout(() => openCreateWizard({}), 150);
    }

    function popMenu(anchor, items) {
        document.querySelectorAll('.mc-menu').forEach(m => m.remove());
        const menu = h('div.mc-menu', { role: 'menu' });
        for (const item of items) {
            if (item === '-') { menu.append(h('div.mc-menu-sep')); continue; }
            menu.append(h('button.mc-menu-item', { type: 'button', class: item.danger ? 'is-danger' : '', onClick: () => { menu.remove(); item.onClick(); } }, icon(item.icon), h('span', null, h('span.mc-menu-label', null, item.label), item.hint ? h('span.mc-menu-hint', null, item.hint) : null)));
        }
        const rect = anchor.getBoundingClientRect();
        document.body.append(menu);
        const width = menu.offsetWidth || 260;
        menu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width))}px`;
        menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
        requestAnimationFrame(() => menu.classList.add('is-open'));
        const off = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('pointerdown', off, true); } };
        setTimeout(() => document.addEventListener('pointerdown', off, true), 0);
        menu.addEventListener('click', ev => ev.stopPropagation());
    }

    /* ------------------------------ Hero ------------------------------ */
    function renderHero(v) {
        const fileInput = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
        fileInput.addEventListener('change', () => { const f = fileInput.files?.[0]; if (f) card.setAvatarFile(f); });
        const img = h('img', { src: v.avatarUrl, alt: '' });
        const avatar = h('button.mc-hero-avatar', { type: 'button', title: t`Change avatar`, onClick: () => fileInput.click() }, img, h('span.mc-hero-avatar-edit', null, icon('camera')));
        const nameEl = h('input.mc-hero-name', { value: v.fields.name, placeholder: t`Name`, title: v.mode === 'create' ? t`Name (required)` : t`Tap to rename`, spellcheck: 'false' });
        nameEl.addEventListener('input', () => { if (card.isCreateMode()) write('name', nameEl.value); });
        nameEl.addEventListener('change', async () => { if (!card.isCreateMode()) { const next = nameEl.value.trim(); if (!next) { nameEl.value = v.fields.name; return; } if (next !== v.fields.name) { await write('name', next); flash(nameEl, 'mc-flash-ok'); } } });
        nameEl.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); nameEl.blur(); } });
        bound.set('name', nameEl);

        const tagRow = h('div.mc-hero-tags');
        const renderTags = () => {
            clear(tagRow);
            const view = card.readCard();
            for (const tag of view.tags) {
                const el = chip({ label: tag.name, icon: 'tag', className: 'mc-chip-tag', onRemove: async () => { el.classList.add('is-leaving'); setTimeout(async () => { await card.removeTag(tag.id); renderTags(); }, motionEnabled() ? 180 : 0); } });
                if (tag.color) el.style.setProperty('--mc-tag', tag.color);
                tagRow.append(el);
            }
            const addBtn = chip({ label: t`Tag`, icon: 'plus', className: 'mc-chip-add', onClick: () => {
                const inp = input({ placeholder: t`Tag name…`, className: 'mc-tag-inline' });
                inp.setAttribute('list', 'mc-tag-names');
                const dl = h('datalist', { id: 'mc-tag-names' }, card.allTagNames().map(n => h('option', { value: n })));
                addBtn.replaceWith(inp, dl);
                inp.focus();
                const done = async (commit) => { const val = inp.value.trim(); dl.remove(); if (commit && val) await card.addTag(val); renderTags(); };
                inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); done(true); } if (ev.key === 'Escape') done(false); });
                inp.addEventListener('blur', () => done(!!inp.value.trim()));
            } });
            tagRow.append(addBtn);
        };
        renderTags();

        const favBtn = iconButton({ icon: 'star', label: v.fav ? t`Remove favourite` : t`Mark as favourite`, className: v.fav ? 'is-on' : '', onClick: (ev) => { card.toggleFav(); flash(ev.currentTarget, 'mc-flash-pop'); setTimeout(sync, 150); } });
        const more = v.mode === 'edit' ? iconButton({ icon: 'ellipsis', label: t`More`, onClick: (ev) => popMenu(ev.currentTarget, [
            { icon: 'clone', label: t`Duplicate`, onClick: async () => { await card.duplicateCurrent(); toastOk(t`Duplicated`); } },
            { icon: 'file-export', label: t`Export card`, onClick: () => card.openExport() },
            { icon: 'image', label: t`Change avatar`, onClick: () => fileInput.click() },
            { icon: 'user', label: t`Convert to persona`, onClick: () => card.convertToPersona() },
            { icon: 'comments', label: t`Interview to rewrite description`, onClick: () => openInterviewWizard({ name: v.fields.name, onResult: async (text) => { pushHistory(historyKey(v, 'description'), v.fields.description, t`Before interview`); await write('description', text); toastOk(t`Description updated`); sync(true); } }) },
            '-',
            { icon: 'trash', label: t`Delete character`, danger: true, onClick: async () => {
                const delChats = h('label.mc-toggle', null, h('span.mc-toggle-text', null, h('span.mc-toggle-label', null, t`Also delete chats`)), h('span.mc-switch', null, h('input', { type: 'checkbox' }), h('span.mc-switch-track', null, h('span.mc-switch-thumb'))));
                const ok = await confirm(t`Delete ${v.fields.name}?`, delChats, { okLabel: t`Delete`, danger: true });
                if (!ok) return;
                const deleteChats = delChats.querySelector('input').checked;
                await card.deleteCurrent({ deleteChats });
                toastOk(t`Character deleted`);
            } },
        ]) }) : null;

        const stats = h('div.mc-hero-badges', null,
            v.mode === 'create' ? h('span.mc-pill.is-active', null, icon('pen'), t`Draft`) : h('span.mc-pill.is-active', null, icon('circle-dot'), t`Autosave`),
            v.world ? h('span.mc-pill', { title: t`Lorebook` }, icon('book'), v.world) : null,
            v.alternate_greetings.length ? h('span.mc-pill', null, icon('layer-group'), `${v.alternate_greetings.length + 1} ${t`greetings`}`) : null,
            h('span.mc-pill.mc-pill-tokens', { title: t`Permanent tokens (description, personality, scenario, overrides)` }, icon('coins'), '…'),
        );
        updatePermanentTokens(v, stats.querySelector('.mc-pill-tokens'));

        return h('div.mc-hero', { class: v.mode === 'create' ? '' : 'is-active' },
            h('div.mc-hero-glow'), avatar, fileInput,
            h('div.mc-hero-main', null, nameEl, tagRow, stats),
            h('div.mc-hero-actions', null, favBtn, more),
        );
    }

    async function updatePermanentTokens(v, el) {
        if (!el) return;
        const text = [v.fields.description, v.fields.personality, v.fields.scenario, v.fields.system_prompt, v.fields.post_history_instructions, v.fields.depth_prompt_prompt].join('\n');
        const n = await card.tokenCount(text);
        if (el.isConnected) { el.lastChild.textContent = ` ${n} ${t`tokens`}`; }
    }

    /* --------------------------- Create bar --------------------------- */
    function renderCreateBar() {
        return h('div.mc-createbar', null,
            h('span.mc-muted', null, t`Nothing is saved until you create the character.`),
            h('span.mc-flex1'),
            button({ label: t`Cancel`, kind: 'ghost', small: true, onClick: () => card.backToList() }),
            button({ label: t`Create character`, icon: 'check', kind: 'primary', className: 'mc-btn-glow', onClick: async (ev) => {
                const btn = ev.currentTarget;
                btn.disabled = true;
                try {
                    const draftTraits = getTraits('__create__');
                    const idx = await card.submitCreate();
                    if (idx < 0) throw new Error(t`SillyTavern did not confirm the new character.`);
                    const avatar = card.ctxCharacters()[idx]?.avatar;
                    if (avatar && draftTraits.length) { setTraits(avatar, draftTraits.map(x => ({ ...x }))); setTraits('__create__', []); }
                    toastOk(t`Character created`);
                    await card.openCharacter(idx);
                } catch (err) { toastErr(err?.message ?? String(err)); btn.disabled = false; }
            } }),
        );
    }

    /* ------------------------------ Write ----------------------------- */
    async function write(fieldKey, value) {
        state.writing++;
        try { await card.setField(fieldKey, value); }
        finally { setTimeout(() => { state.writing = Math.max(0, state.writing - 1); }, 1600); }
    }

    /* ---------------------------- Field editor ------------------------ */
    function fieldEditor(v, fieldKey, { label, iconName, rows = 6, placeholder = '', hint = '', tools = true, generate = null, extraButtons = [] }) {
        const words = h('span.mc-counter');
        const tokens = h('span.mc-counter');
        const update = debounce(async (text) => {
            words.textContent = `${text.trim() ? text.trim().split(/\s+/).length : 0} ${t`words`}`;
            tokens.textContent = `${await card.tokenCount(text)} ${t`tokens`}`;
        }, 250);
        const area = textarea({ value: v.fields[fieldKey] ?? '', rows, placeholder, className: `mc-field-${fieldKey}`, onInput: (text) => { update(text); save(text); } });
        const save = debounce((text) => write(fieldKey, text), 350);
        bound.set(fieldKey, area);
        update(area.value);
        const reviewWrap = h('div');
        const apply = async (text, historyLabel) => {
            pushHistory(historyKey(v, fieldKey), area.value, historyLabel ?? t`Before edit`);
            area.value = text; update(text); await write(fieldKey, text); flash(area, 'mc-flash-ok');
        };
        const append = async (text) => apply((area.value.trim() ? area.value.trim() + '\n\n' : '') + text, t`Before append`);
        const toolbar = h('div.mc-toolbar');
        if (generate) toolbar.append(button({ label: generate.label, icon: 'wand-magic-sparkles', kind: 'accent', small: true, className: generate.glow ? 'mc-btn-glow' : '', onClick: () => aiReview({ container: reviewWrap, title: generate.title ?? generate.label, before: area.value, job: () => generate.job(currentView()), onApply: (x) => apply(x, t`Before generate`), onAppend: generate.append ? append : undefined }) }));
        if (tools) {
            toolbar.append(
                button({ label: t`Polish`, icon: 'wand-magic-sparkles', kind: generate ? 'ghost' : 'accent', small: true, onClick: () => { if (!area.value.trim()) { toastWarn(t`Write a draft first.`); flash(area, 'mc-shake'); return; } aiReview({ container: reviewWrap, title: t`Polished`, before: area.value, job: () => ai.enhance({ card: currentView(), field: fieldKey, text: area.value }), onApply: (x) => apply(x, t`Before polish`) }); } }),
                button({ label: t`Adjust…`, icon: 'sliders', kind: 'ghost', small: true, onClick: () => openRefineWizard({ cardView: currentView(), fieldKey, fieldLabel: label, text: area.value, traits: getTraits(card.cardKey()), historyKey: historyKey(v, fieldKey), onApply: (x) => { area.value = x; update(x); return write(fieldKey, x); } }) }),
                button({ label: t`History`, icon: 'clock-rotate-left', kind: 'ghost', small: true, onClick: () => {
                    const existing = reviewWrap.querySelector('.mc-history-card');
                    if (existing) { existing.remove(); return; }
                    const cardEl = h('div.mc-ai-card.mc-history-card.is-done', null, h('div.mc-ai-head', null, h('span.mc-ai-title', null, icon('clock-rotate-left'), t`Earlier versions`), iconButton({ icon: 'xmark', label: t`Close`, onClick: () => cardEl.remove() })),
                        historyList({ entries: getHistory(historyKey(v, fieldKey)), onRestore: async (entry) => { await apply(entry.description, t`Before restore`); cardEl.remove(); } }));
                    reviewWrap.prepend(cardEl);
                } }),
            );
        }
        for (const b of extraButtons) toolbar.append(b);
        const expand = iconButton({ icon: 'maximize', label: t`Expand editor`, onClick: () => area.classList.toggle('is-tall') });
        return h('div.mc-section', null,
            h('div.mc-section-head', null, h('span.mc-section-title', null, icon(iconName), label), hint ? h('span.mc-section-hint', null, hint) : null, h('span.mc-counters', null, words, tokens), expand),
            area, toolbar, reviewWrap,
        );
    }

    function currentView() { return card.readCard(); }

    /* ------------------------------ Tabs ------------------------------ */
    function renderTab() {
        if (!tabPanel) return;
        clear(tabPanel);
        const v = card.readCard();
        const panel = h('div.mc-tabcontent', { class: motionEnabled() ? 'mc-fade-in' : '' });
        switch (state.tab) {
            case 'greetings': panel.append(renderGreetingsTab(v)); break;
            case 'traits': panel.append(renderTraitsTab(v)); break;
            case 'ai': panel.append(renderAiTab(v)); break;
            case 'advanced': panel.append(renderAdvancedTab(v)); break;
            case 'settings': panel.append(renderSettingsTab()); break;
            default: panel.append(renderCardTab(v));
        }
        tabPanel.append(panel);
    }

    function renderCardTab(v) {
        return h('div', null,
            fieldEditor(v, 'description', { label: t`Description`, iconName: 'align-left', rows: 10, placeholder: t`Who is this character? Appearance, background, personality in action, relationships, how they speak…`, generate: { label: t`Generate from traits`, title: t`Description`, job: (view) => ai.fromTraits({ card: view, traits: getTraits(card.cardKey()) }), append: true } }),
            fieldEditor(v, 'personality', { label: t`Personality`, iconName: 'heart', rows: 4, placeholder: t`A compact summary of temperament, values and flaws`, generate: { label: t`Generate`, title: t`Personality`, job: (view) => ai.personalityFromCard({ card: view }) } }),
            fieldEditor(v, 'scenario', { label: t`Scenario`, iconName: 'map', rows: 4, placeholder: t`Where the story starts and how {{user}} fits in`, generate: { label: t`Generate`, title: t`Scenario`, job: (view) => ai.scenarioFromCard({ card: view }) } }),
        );
    }

    function renderGreetingsTab(v) {
        const s = settings();
        const lenSeg = segmented({ options: GREETING_LENGTHS, value: s.ai.greetingLength, onChange: (x) => setSetting('ai.greetingLength', x) });
        const povSeg = segmented({ options: POVS, value: s.ai.greetingPov, onChange: (x) => setSetting('ai.greetingPov', x) });
        const styleInput = input({ placeholder: t`Optional style hint, e.g. slow burn, in medias res, cosy` });
        const first = fieldEditor(v, 'first_mes', {
            label: t`First message`, iconName: 'comment-dots', rows: 9, placeholder: t`The opening message, narrated by the character…`,
            generate: { label: t`Write first message`, title: t`First message`, glow: true, job: (view) => ai.firstMessage({ card: view, length: settings().ai.greetingLength, pov: settings().ai.greetingPov, style: styleInput.value.trim() }) },
        });
        const altWrap = h('div');
        const altList = h('div.mc-alt-list');
        const renderAlts = () => {
            clear(altList);
            const view = card.readCard();
            if (!view.alternate_greetings.length) altList.append(h('div.mc-trait-empty', null, icon('layer-group'), h('span', null, t`No alternate greetings yet. Players can swipe the first message to pick one.`)));
            view.alternate_greetings.forEach((g, i) => {
                const area = textarea({ value: g, rows: 5, onInput: debounce((x) => card.updateGreeting(i, x), 350) });
                altList.append(h('div.mc-alt-item', null,
                    h('div.mc-alt-head', null, h('span.mc-alt-num', null, String(i + 1)), h('span.mc-flex1'),
                        iconButton({ icon: 'arrow-up', label: t`Move up`, small: true, onClick: () => { card.moveGreeting(i, -1); renderAlts(); } }),
                        iconButton({ icon: 'arrow-down', label: t`Move down`, small: true, onClick: () => { card.moveGreeting(i, 1); renderAlts(); } }),
                        button({ label: t`Polish`, icon: 'wand-magic-sparkles', kind: 'ghost', small: true, onClick: () => aiReview({ container: altWrap, title: `${t`Greeting`} ${i + 1}`, before: area.value, job: () => ai.enhance({ card: card.readCard(), field: 'first_mes', text: area.value }), onApply: (x) => { card.updateGreeting(i, x); renderAlts(); } }) }),
                        iconButton({ icon: 'trash', label: t`Remove`, small: true, onClick: async () => { if (await confirm(t`Remove greeting ${i + 1}?`, '', { okLabel: t`Remove`, danger: true })) { card.removeGreeting(i); renderAlts(); sync(); } } }),
                    ),
                    area,
                ));
            });
            stagger(altList, 40);
        };
        renderAlts();
        const countSel = selectEl({ options: [1, 2, 3, 4, 5].map(n => ({ value: n, label: String(n) })), value: 3, className: 'mc-select-sm' });
        return h('div', null,
            h('div.mc-section', null,
                h('div.mc-section-head', null, h('span.mc-section-title', null, icon('wand-magic-sparkles'), t`Greeting style`)),
                h('div.mc-grid2', null, field({ label: t`Length`, control: lenSeg }), field({ label: t`Narration`, control: povSeg })),
                field({ label: t`Style hint`, control: styleInput }),
            ),
            first,
            h('div.mc-section', null,
                h('div.mc-section-head', null, h('span.mc-section-title', null, icon('layer-group'), t`Alternate greetings`), h('span.mc-flex1'),
                    h('span.mc-inline', null, countSel, button({ label: t`Generate`, icon: 'wand-magic-sparkles', kind: 'accent', small: true, onClick: () => aiReview({ container: altWrap, title: t`Alternate greetings`, job: async () => { const list = await ai.alternateGreetings({ card: card.readCard(), count: Number(countSel.value), length: settings().ai.greetingLength, pov: settings().ai.greetingPov }); if (!list.length) throw new Error(t`No greetings came back.`); altWrap._alts = list; return list.map((x, i) => `${i + 1}. ${x}`).join('\n\n'); }, onApply: () => { for (const g of altWrap._alts ?? []) card.addGreeting(g); renderAlts(); sync(); toastOk(t`Greetings added`); } }) })),
                    button({ label: t`Add`, icon: 'plus', kind: 'ghost', small: true, onClick: () => { card.addGreeting(''); renderAlts(); } }),
                ),
                altList, altWrap,
            ),
            fieldEditor(v, 'mes_example', { label: t`Example dialogues`, iconName: 'comments', rows: 8, placeholder: '<START>\n{{user}}: …\n{{char}}: …', hint: t`Teach the model the voice`, generate: { label: t`Generate 3 examples`, title: t`Example dialogues`, job: (view) => ai.exampleDialogues({ card: view, count: 3 }), append: true } }),
        );
    }

    function renderTraitsTab(v) {
        const keyId = card.cardKey();
        const reviewWrap = h('div');
        const editorEl = traitEditor({ avatarId: keyId });
        const view = () => card.readCard();
        return h('div', null,
            h('div.mc-section', null,
                h('div.mc-section-head', null, h('span.mc-section-title', null, icon('tags'), t`Traits`)),
                h('p.mc-lead', null, t`Small facts by category. Tap to edit, long-press or right-click to move. They feed the AI tools and can be written into the description.`),
                editorEl,
                h('div.mc-toolbar', null,
                    button({ label: t`Suggest traits`, icon: 'wand-magic-sparkles', kind: 'accent', small: true, onClick: () => aiReview({ container: reviewWrap, title: t`Trait ideas`, job: async () => { const found = await ai.suggestTraits({ card: view(), traits: getTraits(keyId) }); if (!found.length) throw new Error(t`No usable suggestions came back.`); reviewWrap._found = found; return found.map(x => `• ${x.text}  (${CATEGORIES.find(c => c.id === x.category)?.label ?? x.category})`).join('\n'); }, onApply: () => { const n = editorEl.addMany(reviewWrap._found ?? []); toastOk(t`Added ${n} traits`); } }) }),
                    button({ label: t`Extract from card`, icon: 'file-import', kind: 'ghost', small: true, onClick: () => { if (!view().fields.description.trim()) { toastWarn(t`The description is empty.`); return; } aiReview({ container: reviewWrap, title: t`Extracted traits`, job: async () => { const found = await ai.extractTraits({ card: view() }); if (!found.length) throw new Error(t`Nothing could be extracted.`); reviewWrap._found = found; return found.map(x => `• ${x.text}  (${CATEGORIES.find(c => c.id === x.category)?.label ?? x.category})`).join('\n'); }, onApply: () => { const n = editorEl.addMany(reviewWrap._found ?? []); toastOk(t`Added ${n} traits`); } }); } }),
                    button({ label: t`Write into description`, icon: 'arrow-right-to-bracket', kind: 'ghost', small: true, onClick: (ev) => popMenu(ev.currentTarget, [
                        { icon: 'list', label: t`Compact list (no AI)`, hint: t`Replaces the description`, onClick: async () => { const traits = getTraits(keyId); if (!traits.length) { toastWarn(t`Add traits first`); return; } pushHistory(historyKey(v, 'description'), v.fields.description, t`Before compile`); await write('description', compileTraits(v.fields.name, traits)); toastOk(t`Description replaced`); sync(true); } },
                        { icon: 'plus', label: t`Append compact list`, onClick: async () => { const traits = getTraits(keyId); if (!traits.length) { toastWarn(t`Add traits first`); return; } pushHistory(historyKey(v, 'description'), v.fields.description, t`Before append`); await write('description', (v.fields.description.trim() ? v.fields.description.trim() + '\n\n' : '') + compileTraits(v.fields.name, traits)); toastOk(t`Traits appended`); sync(true); } },
                        { icon: 'wand-magic-sparkles', label: t`Prose with AI`, onClick: () => aiReview({ container: reviewWrap, title: t`Description from traits`, before: v.fields.description, job: () => ai.fromTraits({ card: view(), traits: getTraits(keyId) }), onApply: async (x) => { pushHistory(historyKey(v, 'description'), v.fields.description, t`Before generate`); await write('description', x); toastOk(t`Description replaced`); sync(true); } }) },
                    ]) }),
                ),
                reviewWrap,
            ),
        );
    }

    function renderAiTab(v) {
        const reviewWrap = h('div');
        const view = () => card.readCard();
        const applyField = async (fieldKey, text, label) => { const cur = view(); pushHistory(historyKey(cur, fieldKey), cur.fields[fieldKey], label); await write(fieldKey, text); toastOk(t`Updated`); sync(true); };
        const tools = [
            { icon: 'comment-dots', label: t`First message`, hint: t`From description, personality, scenario`, run: () => aiReview({ container: reviewWrap, title: t`First message`, before: v.fields.first_mes, job: () => ai.firstMessage({ card: view(), length: settings().ai.greetingLength, pov: settings().ai.greetingPov }), onApply: (x) => applyField('first_mes', x, t`Before generate`) }) },
            { icon: 'layer-group', label: t`3 alternate greetings`, hint: t`Different situations`, run: () => aiReview({ container: reviewWrap, title: t`Alternate greetings`, job: async () => { const list = await ai.alternateGreetings({ card: view(), count: 3, length: settings().ai.greetingLength, pov: settings().ai.greetingPov }); if (!list.length) throw new Error(t`No greetings came back.`); reviewWrap._alts = list; return list.map((x, i) => `${i + 1}. ${x}`).join('\n\n'); }, onApply: () => { for (const g of reviewWrap._alts ?? []) card.addGreeting(g); toastOk(t`Greetings added`); sync(true); } }) },
            { icon: 'comments', label: t`Example dialogues`, hint: t`Teach the voice`, run: () => aiReview({ container: reviewWrap, title: t`Example dialogues`, before: v.fields.mes_example, job: () => ai.exampleDialogues({ card: view(), count: 3 }), onApply: (x) => applyField('mes_example', x, t`Before generate`), onAppend: async (x) => { const cur = view(); await applyField('mes_example', (cur.fields.mes_example.trim() ? cur.fields.mes_example.trim() + '\n' : '') + x, t`Before append`); } }) },
            { icon: 'heart', label: t`Personality`, hint: t`Summarise from the description`, run: () => aiReview({ container: reviewWrap, title: t`Personality`, before: v.fields.personality, job: () => ai.personalityFromCard({ card: view() }), onApply: (x) => applyField('personality', x, t`Before generate`) }) },
            { icon: 'map', label: t`Scenario`, hint: t`Where the story starts`, run: () => aiReview({ container: reviewWrap, title: t`Scenario`, before: v.fields.scenario, job: () => ai.scenarioFromCard({ card: view() }), onApply: (x) => applyField('scenario', x, t`Before generate`) }) },
            { icon: 'stethoscope', label: t`Consistency check`, hint: t`Contradictions, gaps, wasted tokens`, run: () => aiReview({ container: reviewWrap, title: t`Editor's review`, allowRetry: true, job: () => ai.consistencyCheck({ card: view() }), onApply: async (x) => { try { await navigator.clipboard.writeText(x); toastOk(t`Copied to clipboard`); } catch { toastWarn(t`Clipboard not available`); } } }) },
            { icon: 'tag', label: t`Suggest tags`, hint: t`Genre, archetype, tone`, run: () => aiReview({ container: reviewWrap, title: t`Tag ideas`, job: async () => { const tags = await ai.suggestTags({ card: view() }); if (!tags.length) throw new Error(t`No tags came back.`); reviewWrap._tags = tags; return tags.join(', '); }, onApply: async () => { for (const tg of reviewWrap._tags ?? []) await card.addTag(tg); toastOk(t`Tags added`); sync(true); } }) },
            { icon: 'note-sticky', label: t`Creator notes`, hint: t`For people who download the card`, run: () => aiReview({ container: reviewWrap, title: t`Creator notes`, before: v.fields.creator_notes, job: () => ai.suggestCreatorNotes({ card: view() }), onApply: (x) => applyField('creator_notes', x, t`Before generate`) }) },
            { icon: 'comments', label: t`Interview`, hint: t`Answer questions, get a description`, run: () => openInterviewWizard({ name: v.fields.name, onResult: (x) => applyField('description', x, t`Before interview`) }) },
        ];
        const grid = h('div.mc-tool-grid');
        for (const tool of tools) grid.append(h('button.mc-tool', { type: 'button', onClick: tool.run }, h('span.mc-tool-icon', null, icon(tool.icon)), h('span.mc-tool-label', null, tool.label), h('span.mc-tool-hint', null, tool.hint)));
        requestAnimationFrame(() => stagger(grid, 30, 300));

        const fieldSel = selectEl({ options: card.TEXT_FIELDS.map(k => ({ value: k, label: card.FIELDS[k].label })), value: 'description' });
        const toneRow = h('div.mc-tone-row');
        for (const tone of TONES) toneRow.append(chip({ label: tone.label, title: tone.hint, onClick: () => { const k = fieldSel.value; const cur = view(); if (!cur.fields[k]?.trim()) { toastWarn(t`That field is empty.`); return; } aiReview({ container: reviewWrap, title: `${tone.label} ${t`rewrite`}`, before: cur.fields[k], job: () => ai.retone({ card: cur, field: k, text: cur.fields[k], tone: tone.id }), onApply: (x) => applyField(k, x, t`Before tone change`) }); } }));
        const customInput = textarea({ rows: 2, placeholder: t`e.g. Make her more guarded with strangers and add a nervous habit.` });
        const customBtn = button({ label: t`Apply to field`, icon: 'wand-magic-sparkles', kind: 'accent', small: true, onClick: () => { const instruction = customInput.value.trim(); const k = fieldSel.value; const cur = view(); if (!instruction) { flash(customInput, 'mc-shake'); return; } if (!cur.fields[k]?.trim()) { toastWarn(t`That field is empty.`); return; } aiReview({ container: reviewWrap, title: t`Custom edit`, before: cur.fields[k], job: () => ai.custom({ card: cur, field: k, text: cur.fields[k], instruction, traits: getTraits(card.cardKey()) }), onApply: (x) => applyField(k, x, t`Before custom edit`) }); } });

        return h('div', null,
            h('div.mc-section', null, h('div.mc-section-head', null, h('span.mc-section-title', null, icon('wand-magic-sparkles'), t`AI Studio`)), h('div.mc-ai-hint', null, icon('plug'), h('span', null, t`Uses the API and model you are currently connected to.`)), grid),
            h('div.mc-section', null, h('div.mc-section-head', null, h('span.mc-section-title', null, icon('palette'), t`Rewrite a field`)), field({ label: t`Field`, control: fieldSel }), h('div.mc-field-head', null, h('span.mc-field-label', null, t`Tone`)), toneRow, h('div.mc-field-head', { style: { marginTop: '10px' } }, h('span.mc-field-label', null, t`Custom instruction`)), customInput, h('div.mc-toolbar', null, customBtn)),
            reviewWrap,
        );
    }

    function renderAdvancedTab(v) {
        const books = card.lorebookNames();
        const loreSel = selectEl({ options: [{ value: '', label: t`None` }, ...books.map(b => ({ value: b, label: b }))], value: v.world, onChange: (val) => card.setWorld(val) });
        const depthRoleSel = selectEl({ options: [{ value: 'system', label: t`System` }, { value: 'user', label: t`User` }, { value: 'assistant', label: t`Assistant` }], value: v.fields.depth_prompt_role, onChange: (val) => write('depth_prompt_role', val) });
        const talk = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: String(v.fields.talkativeness), 'data-mmu-free': '1', class: 'mc-range' });
        const talkVal = h('span.mc-counter', null, talkLabel(v.fields.talkativeness));
        talk.addEventListener('input', () => { talkVal.textContent = talkLabel(talk.value); });
        talk.addEventListener('change', () => write('talkativeness', Number(talk.value)));
        return h('div', null,
            fieldEditor(v, 'creator_notes', { label: t`Creator notes`, iconName: 'note-sticky', rows: 4, placeholder: t`Shown to people who download the card`, generate: { label: t`Write notes`, title: t`Creator notes`, job: (view) => ai.suggestCreatorNotes({ card: view }) } }),
            h('div.mc-section', null,
                h('div.mc-section-head', null, h('span.mc-section-title', null, icon('book'), t`Lorebook`)),
                field({ label: t`Primary lorebook`, hint: v.hasEmbeddedBook ? t`This card also carries an embedded lorebook` : '', control: loreSel }),
                h('div.mc-toolbar', null, button({ label: t`Auxiliary lorebooks…`, icon: 'books', kind: 'ghost', small: true, onClick: () => card.openAdvancedLorebook() })),
            ),
            h('div.mc-section', null,
                h('div.mc-section-head', null, h('span.mc-section-title', null, icon('circle-info'), t`Metadata`)),
                h('div.mc-grid2', null,
                    field({ label: t`Creator`, control: boundInput(v, 'creator') }),
                    field({ label: t`Version`, control: boundInput(v, 'character_version') }),
                ),
                field({ label: t`Embedded tags`, hint: t`Stored inside the card file, comma separated`, control: boundInput(v, 'card_tags') }),
            ),
            fieldEditor(v, 'depth_prompt_prompt', { label: t`Character note`, iconName: 'thumbtack', rows: 3, placeholder: t`Injected into the chat at the depth below`, tools: true }),
            h('div.mc-section', null,
                h('div.mc-section-head', null, h('span.mc-section-title', null, icon('arrows-up-down'), t`Note placement & talkativeness`)),
                h('div.mc-grid2', null,
                    field({ label: t`Depth`, control: boundInput(v, 'depth_prompt_depth', 'number') }),
                    field({ label: t`Role`, control: depthRoleSel }),
                ),
                field({ label: t`Talkativeness in groups`, hint: talkVal, control: talk }),
            ),
            fieldEditor(v, 'system_prompt', { label: t`System prompt override`, iconName: 'terminal', rows: 4, placeholder: t`Replaces the preset's main prompt when “Prefer character prompt” is on`, tools: true }),
            fieldEditor(v, 'post_history_instructions', { label: t`Post-history instructions`, iconName: 'arrow-down-short-wide', rows: 3, placeholder: t`Appended after the chat history`, tools: true }),
        );
    }

    function talkLabel(x) { const n = Number(x); return n < 0.34 ? t`Shy` : n < 0.67 ? t`Normal` : t`Chatty`; }

    function boundInput(v, fieldKey, type = 'text') {
        const el = input({ type, value: String(v.fields[fieldKey] ?? ''), onChange: (val) => write(fieldKey, type === 'number' ? Number(val) : val) });
        bound.set(fieldKey, el);
        return el;
    }

    function renderSettingsTab() {
        const s = settings();
        const sys = textarea({ value: s.ai.systemPrompt, rows: 6, onChange: (val) => setSetting('ai.systemPrompt', val || DEFAULT_AI_SYSTEM_PROMPT) });
        return h('div', null,
            h('div.mc-section', null,
                h('div.mc-section-head', null, h('span.mc-section-title', null, icon('sliders'), t`Appearance`)),
                h('div.mc-toggle-stack', null,
                    toggle({ label: t`Replace the built-in character editor`, hint: t`Turn off to see the stock form again (reload to apply)`, checked: s.replaceNative, onChange: (val) => { setSetting('replaceNative', val); document.body.classList.toggle('mc-replacing', val); } }),
                    toggle({ label: t`Animations`, checked: s.animations, onChange: (val) => { setSetting('animations', val); document.body.classList.toggle('mc-no-motion', !val); } }),
                    toggle({ label: t`Word-by-word reveal for AI results`, checked: s.ai.wordReveal, onChange: (val) => setSetting('ai.wordReveal', val) }),
                ),
                h('p.mc-muted', null, t`Colours, font and dark/light mode follow Modern Mobile UI when it is installed.`),
            ),
            h('div.mc-section', null,
                h('div.mc-section-head', null, h('span.mc-section-title', null, icon('robot'), t`AI`)),
                h('div.mc-toggle-stack', null, toggle({ label: t`Give the AI your persona for context`, hint: t`So greetings fit the player's character`, checked: s.ai.includePersona, onChange: (val) => setSetting('ai.includePersona', val) })),
                h('div.mc-grid2', null,
                    field({ label: t`Max response tokens`, hint: t`0 = SillyTavern's response length`, control: input({ type: 'number', value: String(s.ai.maxTokens ?? 0), onChange: (val) => setSetting('ai.maxTokens', Math.max(0, Number(val) || 0)) }) }),
                    field({ label: t`Output language`, hint: t`Blank = same as the card`, control: input({ value: s.ai.language, placeholder: t`e.g. German`, onChange: (val) => setSetting('ai.language', val.trim()) }) }),
                ),
                field({ label: t`System prompt`, control: sys }),
                h('div.mc-toolbar', null, button({ label: t`Reset prompt`, icon: 'rotate-left', kind: 'ghost', small: true, onClick: () => { sys.value = DEFAULT_AI_SYSTEM_PROMPT; setSetting('ai.systemPrompt', DEFAULT_AI_SYSTEM_PROMPT); flash(sys, 'mc-flash-ok'); } })),
            ),
            h('div.mc-about', null, icon('address-card'), h('span', null, 'Modern Character'), h('a', { href: 'https://github.com/Kittyspit04/ModernCharacter', target: '_blank', rel: 'noopener' }, 'GitHub')),
        );
    }

    /* ---------------------------------------------------------------- */
    /* Sync + events                                                    */
    /* ---------------------------------------------------------------- */
    /** Soft update: refresh values of controls that are not focused. */
    function sync(force = false) {
        if (!app.isConnected) return;
        const k = key();
        if (k !== state.renderedKey) { render(); return; }
        if (state.writing > 0 && !force) return;
        const v = card.readCard();
        for (const [fieldKey, el] of bound) {
            if (document.activeElement === el) continue;
            const next = String(v.fields[fieldKey] ?? '');
            if (el.value !== next) el.value = next;
        }
        // Hero bits that change from the outside
        const img = hero?.querySelector('.mc-hero-avatar img');
        if (img && !img.getAttribute('src')?.startsWith('data:') && img.getAttribute('src') !== v.avatarUrl) img.setAttribute('src', v.avatarUrl);
        if (force) { const old = hero; hero = renderHero(v); old?.replaceWith(hero); renderTab(); }
    }

    function bindEvents() {
        const { source, types } = events();
        const soft = debounce(() => sync(), 150);
        source.on(types.CHARACTER_EDITOR_OPENED, () => { state.renderedKey = null; render(); });
        source.on(types.CHARACTER_EDITED, soft);
        source.on(types.CHAT_CHANGED, soft);
        if (types.CHARACTER_RENAMED) source.on(types.CHARACTER_RENAMED, soft);
        if (types.CHARACTER_DELETED) source.on(types.CHARACTER_DELETED, () => { state.renderedKey = null; });
        if (types.WORLDINFO_UPDATED) source.on(types.WORLDINFO_UPDATED, soft);
        // Avatar preview changes in the native form (after crop)
        const preview = document.getElementById('avatar_load_preview');
        if (preview) new MutationObserver(() => { const img = hero?.querySelector('.mc-hero-avatar img'); if (img) img.setAttribute('src', preview.getAttribute('src') || ''); }).observe(preview, { attributes: true, attributeFilter: ['src'] });
    }

    bindEvents();
    return { render, sync, setTab: (tab) => { state.tab = tab; renderTab(); tabs?.select(tab); }, openCreate: () => startCreate(true) };
}
