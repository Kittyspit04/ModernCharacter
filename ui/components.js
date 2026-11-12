/**
 * Larger reusable widgets: the AI review card, trait editor and avatar picker.
 */
import { h, icon, button, iconButton, chip, clear, wordReveal, spinnerDots, flash, input, select as selectEl, stagger, motionEnabled, toastWarn, confirm, promptText, revealInScroller } from './dom.js';
import * as ai from '../lib/ai.js';
import { CATEGORIES, PRESETS, categoryOf, getTraits, addTrait, removeTrait, updateTrait, moveTrait, groupTraits } from '../lib/traits.js';
import { pushHistory } from '../lib/settings.js';
import { t } from '../lib/st.js';

/**
 * Runs an AI job and shows the result for review.
 * @param {{ container: HTMLElement, title: string, before?: string, job: () => Promise<string>, onApply: (text:string) => Promise<void>|void, onAppend?: (text:string) => Promise<void>|void, allowRetry?: boolean }} opts
 */
export function aiReview({ container, title, before = '', job, onApply, onAppend, allowRetry = true }) {
    clear(container);
    const output = h('div.mc-ai-output');
    const status = h('div.mc-ai-status', null, h('span.mc-ai-orb'), h('span.mc-ai-status-text', null, t`Thinking`), spinnerDots());
    const stopBtn = button({ label: t`Stop`, icon: 'stop', kind: 'ghost', small: true, onClick: () => ai.stop() });
    const actions = h('div.mc-ai-actions');
    const card = h('div.mc-ai-card.is-thinking', null,
        h('div.mc-ai-head', null, h('span.mc-ai-title', null, icon('wand-magic-sparkles'), title), stopBtn),
        status,
        h('div.mc-ai-skeleton', null, h('i'), h('i'), h('i')),
        output,
        actions,
    );
    container.append(card);
    requestAnimationFrame(() => revealInScroller(card));

    let result = '';
    let busy = true;

    async function start() {
        busy = true;
        result = '';
        card.classList.add('is-thinking');
        card.classList.remove('is-done', 'is-error');
        clear(output);
        clear(actions);
        status.querySelector('.mc-ai-status-text').textContent = t`Thinking`;
        stopBtn.style.display = '';
        try {
            result = await job();
            if (!result) throw new Error('The model returned nothing. Check your API connection and try again.');
            busy = false;
            card.classList.remove('is-thinking');
            card.classList.add('is-done');
            stopBtn.style.display = 'none';
            status.querySelector('.mc-ai-status-text').textContent = t`Suggestion ready`;
            await wordReveal(output, result);
            renderActions();
        } catch (err) {
            busy = false;
            card.classList.remove('is-thinking');
            card.classList.add('is-error');
            stopBtn.style.display = 'none';
            status.querySelector('.mc-ai-status-text').textContent = t`Something went wrong`;
            output.textContent = err?.message ?? String(err);
            clear(actions);
            if (allowRetry) actions.append(button({ label: t`Retry`, icon: 'rotate-right', kind: 'primary', small: true, onClick: start }));
            actions.append(button({ label: t`Dismiss`, icon: 'xmark', kind: 'ghost', small: true, onClick: () => card.remove() }));
        }
    }

    function renderActions() {
        clear(actions);
        actions.append(button({
            label: t`Use this`, icon: 'check', kind: 'primary', small: true, onClick: async () => {
                await onApply(result);
                card.classList.add('is-applied');
                flash(card, 'mc-flash-ok');
                setTimeout(() => card.remove(), motionEnabled() ? 650 : 0);
            },
        }));
        if (onAppend) {
            actions.append(button({
                label: t`Append`, icon: 'plus', kind: 'ghost', small: true, onClick: async () => {
                    await onAppend(result);
                    card.classList.add('is-applied');
                    setTimeout(() => card.remove(), motionEnabled() ? 650 : 0);
                },
            }));
        }
        actions.append(button({ label: t`Copy`, icon: 'copy', kind: 'ghost', small: true, onClick: async () => { try { await navigator.clipboard.writeText(result); flash(card, 'mc-flash-ok'); } catch { toastWarn(t`Clipboard is not available`); } } }));
        if (allowRetry) actions.append(button({ label: t`Retry`, icon: 'rotate-right', kind: 'ghost', small: true, onClick: start }));
        if (before) {
            const compare = button({
                label: t`Compare`, icon: 'code-compare', kind: 'ghost', small: true, onClick: () => {
                    const existing = card.querySelector('.mc-ai-compare');
                    if (existing) { existing.remove(); return; }
                    card.insertBefore(h('div.mc-ai-compare', null, h('div.mc-ai-compare-label', null, t`Before`), h('div.mc-ai-compare-text', null, before)), actions);
                },
            });
            actions.append(compare);
        }
        actions.append(button({ label: t`Discard`, icon: 'xmark', kind: 'ghost', small: true, onClick: () => card.remove() }));
    }

    start();
    return { card, get busy() { return busy; } };
}

/**
 * Trait editor for a persona.
 * @param {{ avatarId: string|null, draft?: Array<{id:string,category:string,text:string}>, onChange?: () => void, compact?: boolean }} opts
 */
export function traitEditor({ avatarId, draft = null, onChange, compact = false }) {
    // Either edit the persisted list for a persona or an in-memory draft list (wizard).
    const list = () => draft ?? getTraits(avatarId);
    const root = h('div.mc-traits', { class: compact ? 'is-compact' : '' });
    let activeCategory = 'personality';
    let filter = 'all';

    const picker = h('div.mc-trait-picker');
    const board = h('div.mc-trait-board');
    const summary = h('div.mc-trait-summary');
    root.append(picker, summary, board);

    function add(category, text) {
        const clean = String(text ?? '').trim();
        if (!clean) return false;
        if (draft) {
            if (draft.some(x => x.category === category && x.text.toLowerCase() === clean.toLowerCase())) return false;
            draft.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, category, text: clean });
        } else if (!addTrait(avatarId, category, clean)) {
            return false;
        }
        onChange?.();
        return true;
    }
    function remove(id) {
        if (draft) {
            const i = draft.findIndex(x => x.id === id);
            if (i >= 0) draft.splice(i, 1);
        } else {
            removeTrait(avatarId, id);
        }
        onChange?.();
    }
    function edit(id, patch) {
        if (draft) Object.assign(draft.find(x => x.id === id) ?? {}, patch);
        else updateTrait(avatarId, id, patch);
        onChange?.();
    }
    function move(id, dir) {
        if (draft) {
            const i = draft.findIndex(x => x.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= draft.length) return;
            [draft[i], draft[j]] = [draft[j], draft[i]];
        } else {
            moveTrait(avatarId, id, dir);
        }
        onChange?.();
    }

    function renderPicker() {
        clear(picker);
        const catRow = h('div.mc-cat-row');
        for (const cat of CATEGORIES) {
            catRow.append(chip({
                label: cat.label, icon: cat.icon, active: cat.id === activeCategory, title: cat.hint,
                onClick: () => { activeCategory = cat.id; renderPicker(); },
            }));
        }
        const text = input({ placeholder: `${categoryOf(activeCategory).hint}…`, className: 'mc-trait-input' });
        const addBtn = button({ label: t`Add`, icon: 'plus', kind: 'primary', small: true, onClick: () => commit() });
        function commit() {
            if (add(activeCategory, text.value)) {
                text.value = '';
                renderBoard(true);
                renderSummary();
            }
            text.focus();
        }
        text.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
        const presets = h('div.mc-preset-row');
        const used = new Set(list().filter(x => x.category === activeCategory).map(x => x.text.toLowerCase()));
        for (const preset of (PRESETS[activeCategory] ?? [])) {
            if (used.has(preset.toLowerCase())) continue;
            presets.append(chip({
                label: preset, className: 'mc-chip-preset', onClick: (ev) => {
                    if (add(activeCategory, preset)) { ev.currentTarget.classList.add('is-popped'); setTimeout(() => { renderPicker(); renderBoard(true); renderSummary(); }, motionEnabled() ? 220 : 0); }
                },
            }));
        }
        picker.append(catRow, h('div.mc-trait-add', null, text, addBtn), presets.children.length ? h('div.mc-preset-wrap', null, h('div.mc-preset-label', null, t`Quick add`), presets) : null);
        stagger(presets, 18, 360);
    }

    function renderSummary() {
        clear(summary);
        const all = list();
        const grouped = groupTraits(all);
        const filters = [{ id: 'all', label: `${t`All`} · ${all.length}` }];
        for (const cat of CATEGORIES) {
            const n = grouped.get(cat.id).length;
            if (n) filters.push({ id: cat.id, label: `${cat.label} · ${n}` });
        }
        if (filters.length <= 1) return;
        const row = h('div.mc-filter-row');
        for (const f of filters) {
            row.append(chip({ label: f.label, active: filter === f.id, className: 'mc-chip-filter', onClick: () => { filter = f.id; renderSummary(); renderBoard(); } }));
        }
        summary.append(row);
    }

    function renderBoard(animateLast = false) {
        clear(board);
        const all = list();
        if (!all.length) {
            board.append(h('div.mc-trait-empty', null, icon('wand-sparkles'), h('span', null, t`No traits yet. Add a few above, or let the AI suggest some.`)));
            return;
        }
        const grouped = groupTraits(all);
        for (const cat of CATEGORIES) {
            const items = grouped.get(cat.id);
            if (!items.length || (filter !== 'all' && filter !== cat.id)) continue;
            const group = h('div.mc-trait-group', { dataset: { category: cat.id } },
                h('div.mc-trait-group-head', null, icon(cat.icon), h('span', null, cat.label), h('span.mc-count', null, String(items.length))),
            );
            const chips = h('div.mc-trait-chips');
            for (const trait of items) {
                const el = chip({
                    label: trait.text,
                    title: t`Tap to edit`,
                    className: 'mc-chip-trait',
                    onClick: async () => {
                        const next = await promptText(t`Edit trait`, { value: trait.text, okLabel: t`Save` });
                        if (next !== null && next.trim() && next !== trait.text) { edit(trait.id, { text: next.trim() }); renderBoard(); }
                    },
                    onRemove: () => {
                        el.classList.add('is-leaving');
                        setTimeout(() => { remove(trait.id); renderBoard(); renderSummary(); renderPicker(); }, motionEnabled() ? 180 : 0);
                    },
                });
                el.dataset.traitId = trait.id;
                // Long-press / context menu to move category
                el.addEventListener('contextmenu', async (ev) => {
                    ev.preventDefault();
                    const target = await pickCategory(trait.category);
                    if (target && target !== trait.category) { edit(trait.id, { category: target }); renderBoard(); renderSummary(); }
                });
                chips.append(el);
            }
            group.append(chips);
            board.append(group);
        }
        if (animateLast) {
            const last = board.querySelector('.mc-chip-trait:last-child');
            if (last) { last.classList.add('is-new'); }
        }
        stagger(board, 40, 300);
    }

    async function pickCategory(current) {
        return new Promise(resolve => {
            const sel = selectEl({ options: CATEGORIES.map(c => ({ value: c.id, label: c.label })), value: current });
            confirm(t`Move trait to`, sel, { okLabel: t`Move` }).then(ok => resolve(ok ? sel.value : null));
        });
    }

    renderPicker();
    renderSummary();
    renderBoard();

    root.refresh = () => { renderPicker(); renderSummary(); renderBoard(); };
    root.addMany = (traits) => {
        let added = 0;
        for (const tr of traits) if (add(tr.category, tr.text)) added++;
        root.refresh();
        return added;
    };
    root.list = list;
    return root;
}

/**
 * Avatar picker with live preview. Returns element with `.file` getter.
 */
export function avatarPicker({ previewUrl = '', onPick, label = t`Choose image` }) {
    const img = h('img.mc-avatar-preview-img', { src: previewUrl || 'img/user-default.png', alt: '' });
    const fileInput = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' } });
    let file = null;
    fileInput.addEventListener('change', () => {
        file = fileInput.files?.[0] ?? null;
        if (file) {
            const url = URL.createObjectURL(file);
            img.src = url;
            flash(wrap, 'mc-flash-pop');
            onPick?.(file);
        }
    });
    const wrap = h('div.mc-avatar-picker', null,
        h('button.mc-avatar-preview', { type: 'button', title: label, onClick: () => fileInput.click() }, img, h('span.mc-avatar-overlay', null, icon('camera'))),
        fileInput,
        button({ label, icon: 'image', kind: 'ghost', small: true, onClick: () => fileInput.click() }),
    );
    Object.defineProperty(wrap, 'file', { get: () => file });
    wrap.setPreview = (url) => { img.src = url; };
    return wrap;
}

/** Interactive history list for undo. */
export function historyList({ entries, onRestore }) {
    const root = h('div.mc-history');
    if (!entries.length) {
        root.append(h('div.mc-muted', null, t`No earlier versions yet. Every AI edit saves one here.`));
        return root;
    }
    [...entries].reverse().forEach((entry) => {
        const when = new Date(entry.ts);
        const item = h('div.mc-history-item', null,
            h('div.mc-history-meta', null, h('span.mc-history-label', null, entry.label), h('span.mc-history-time', null, when.toLocaleString())),
            h('div.mc-history-text', null, entry.description.slice(0, 220) + (entry.description.length > 220 ? '…' : '')),
            button({ label: t`Restore`, icon: 'clock-rotate-left', kind: 'ghost', small: true, onClick: () => onRestore(entry) }),
        );
        root.append(item);
    });
    stagger(root, 40);
    return root;
}

export { pushHistory };
