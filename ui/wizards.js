/**
 * Wizards: Create (concept → card), Refine (one field), Interview.
 */
import { h, icon, button, chip, field, input, textarea, select as selectEl, toggle, segmented, openSheet, clear, stagger, motionEnabled, toastOk, toastWarn, toastErr, flash } from './dom.js';
import { traitEditor, avatarPicker, aiReview } from './components.js';
import * as card from '../lib/card.js';
import * as ai from '../lib/ai.js';
import { TONES, pushHistory, settings } from '../lib/settings.js';
import { setTraits } from '../lib/traits.js';
import { t } from '../lib/st.js';

const LENGTHS = [{ value: 'short', label: t`Short` }, { value: 'medium', label: t`Medium` }, { value: 'long', label: t`Long` }];
const GREETING_LENGTHS = [{ value: 'short', label: t`Short` }, { value: 'medium', label: t`Medium` }, { value: 'long', label: t`Long` }, { value: 'epic', label: t`Epic` }];
const POVS = [{ value: 'third', label: t`Third person` }, { value: 'second', label: t`“You”` }, { value: 'first', label: t`First person` }];

function stepDots(count, active) {
    return h('div.mc-step-dots', null, Array.from({ length: count }, (_, i) => h('span', { class: i === active ? 'is-active' : i < active ? 'is-done' : '' })));
}

function draftCard(state) {
    return { mode: 'create', fields: { name: state.name, description: state.description, personality: state.personality, scenario: state.scenario, first_mes: state.first_mes, mes_example: state.mes_example, creator_notes: state.creator_notes } };
}

/* ------------------------------------------------------------------ */
/* Create wizard                                                       */
/* ------------------------------------------------------------------ */

export function openCreateWizard({ onDone } = {}) {
    const s = settings();
    const state = {
        concept: '', name: '', avatar: null, tags: [], traits: [],
        description: '', personality: '', scenario: '', first_mes: '', alternate_greetings: [], mes_example: '', creator_notes: '',
        world: '', fav: false, length: 'medium', greetingLength: s.ai.greetingLength || 'medium', pov: s.ai.greetingPov || 'third',
    };
    const steps = [conceptStep, basicsStep, traitsStep, descriptionStep, mindStep, greetingStep, examplesStep, extrasStep, reviewStep];
    const titles = [t`Concept`, t`Name & look`, t`Traits`, t`Description`, t`Personality & scenario`, t`First message`, t`Example dialogues`, t`Extras`, t`Review`];
    let index = 0;
    let dir = 1;
    const sheet = openSheet({ title: t`New character`, subtitle: titles[0], wide: true });

    function go(next) { dir = next > index ? 1 : -1; index = Math.max(0, Math.min(steps.length - 1, next)); render(); }
    function render() {
        sheet.setTitle(t`New character`, titles[index]);
        sheet.setProgress((index + 1) / steps.length);
        sheet.setStep(h('div', null, stepDots(steps.length, index), steps[index]()), dir);
        const isLast = index === steps.length - 1;
        const back = button({ label: t`Back`, icon: 'arrow-left', kind: 'ghost', onClick: () => go(index - 1), disabled: index === 0 });
        const next = button({
            label: isLast ? t`Create character` : t`Continue`, icon: isLast ? 'check' : 'arrow-right', kind: 'primary', className: isLast ? 'mc-btn-glow' : '',
            onClick: async () => {
                if (index === 1 && !state.name.trim()) { toastWarn(t`Give the character a name first`); flash(sheet.panel.querySelector('.mc-input'), 'mc-shake'); return; }
                if (isLast) await finish(next); else go(index + 1);
            },
        });
        sheet.setFooter(back, h('span.mc-flex1'), next);
    }

    async function finish(btn) {
        if (!state.name.trim()) { toastWarn(t`A name is required`); go(1); return; }
        btn.disabled = true; btn.classList.add('is-loading');
        try {
            // Make sure the native editor is in create mode, then write the draft into it.
            if (!card.isCreateMode()) {
                document.getElementById('rm_button_create')?.click();
                await new Promise(r => setTimeout(r, 250));
            }
            if (state.avatar) { card.setAvatarFile(state.avatar); await new Promise(r => setTimeout(r, 50)); }
            const map = { name: state.name, description: state.description, personality: state.personality, scenario: state.scenario, first_mes: state.first_mes, mes_example: state.mes_example, creator_notes: state.creator_notes };
            for (const [key, value] of Object.entries(map)) await card.setField(key, value);
            card.setGreetings(state.alternate_greetings);
            for (const tag of state.tags) await card.addTag(tag);
            if (state.world) await card.setWorld(state.world);
            if (state.fav) card.toggleFav();
            const newIndex = await card.submitCreate();
            if (newIndex < 0) throw new Error(t`SillyTavern did not confirm the new character. Check the character list.`);
            const avatar = card.ctxCharacters()[newIndex]?.avatar;
            if (avatar && state.traits.length) setTraits(avatar, state.traits.map(x => ({ ...x })));
            if (avatar && state.description) pushHistory(`${avatar}::description`, state.description, t`Created`);
            toastOk(t`${state.name} is ready`, t`Character created`);
            sheet.close();
            await card.openCharacter(newIndex);
            onDone?.(newIndex);
        } catch (err) {
            console.error(err);
            toastErr(err?.message ?? String(err));
            btn.disabled = false; btn.classList.remove('is-loading');
        }
    }

    /* Step 1: concept */
    function conceptStep() {
        const concept = textarea({ value: state.concept, rows: 4, placeholder: t`e.g. A retired pirate captain who now runs a lighthouse and lies about her past. Melancholic, funny, fiercely protective. Modern-day Scotland.`, onInput: (v) => { state.concept = v; } });
        const nameInput = input({ value: state.name, placeholder: t`Name (optional, the AI can invent one)`, onInput: (v) => { state.name = v; } });
        const lengthSeg = segmented({ options: LENGTHS, value: state.length, onChange: (v) => { state.length = v; } });
        const reviewWrap = h('div');
        const draftBtn = button({
            label: t`Draft the whole card with AI`, icon: 'wand-magic-sparkles', kind: 'accent', className: 'mc-btn-glow', onClick: () => {
                if (!state.concept.trim()) { toastWarn(t`Describe the concept first`); flash(concept, 'mc-shake'); return; }
                aiReview({
                    container: reviewWrap, title: t`Drafted card`, allowRetry: true,
                    job: async () => {
                        const result = await ai.cardFromConcept({ concept: state.concept, name: state.name, length: state.length, traits: state.traits });
                        reviewWrap._result = result;
                        return `${t`Name`}: ${result.name}\n\n${t`Description`}:\n${result.description}\n\n${t`Personality`}:\n${result.personality}\n\n${t`Scenario`}:\n${result.scenario}\n\n${t`First message`}:\n${result.first_mes}\n\n${t`Tags`}: ${result.tags.join(', ')}`;
                    },
                    onApply: () => {
                        const r = reviewWrap._result;
                        if (!r) return;
                        Object.assign(state, { name: r.name || state.name, description: r.description, personality: r.personality, scenario: r.scenario, first_mes: r.first_mes, creator_notes: r.creator_notes });
                        state.tags = [...new Set([...state.tags, ...r.tags])];
                        nameInput.value = state.name;
                        toastOk(t`Card drafted. Walk through the steps to review each part.`);
                    },
                });
            },
        });
        return h('div', null,
            h('p.mc-lead', null, t`Start from an idea. You can let the AI draft every field from it, or skip this and fill things in yourself.`),
            field({ label: t`Concept`, control: concept }),
            field({ label: t`Name`, control: nameInput }),
            field({ label: t`Description length`, control: lengthSeg }),
            h('div.mc-row-end', null, draftBtn),
            reviewWrap,
        );
    }

    /* Step 2: basics */
    function basicsStep() {
        const picker = avatarPicker({ previewUrl: state.avatar ? URL.createObjectURL(state.avatar) : 'img/ai4.png', onPick: (file) => { state.avatar = file; } });
        const nameInput = input({ value: state.name, placeholder: t`Name`, onInput: (v) => { state.name = v; } });
        const tagRow = h('div.mc-chip-row');
        const tagInput = input({ placeholder: t`Add a tag and press Enter`, className: 'mc-tag-input' });
        const list = h('datalist', { id: 'mc-wizard-tags' }, card.allTagNames().map(n => h('option', { value: n })));
        tagInput.setAttribute('list', 'mc-wizard-tags');
        function renderTags() {
            clear(tagRow);
            for (const tag of state.tags) tagRow.append(chip({ label: tag, icon: 'tag', onRemove: () => { state.tags = state.tags.filter(x => x !== tag); renderTags(); } }));
        }
        tagInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); const v = tagInput.value.trim().replace(/,$/, ''); if (v && !state.tags.includes(v)) { state.tags.push(v); renderTags(); } tagInput.value = ''; } });
        renderTags();
        const suggestWrap = h('div');
        const suggest = button({ label: t`Suggest tags`, icon: 'wand-magic-sparkles', kind: 'ghost', small: true, onClick: () => aiReview({ container: suggestWrap, title: t`Tag ideas`, job: async () => { const tags = await ai.suggestTags({ card: draftCard(state) }); if (!tags.length) throw new Error(t`No tags came back.`); suggestWrap._tags = tags; return tags.join(', '); }, onApply: () => { state.tags = [...new Set([...state.tags, ...(suggestWrap._tags ?? [])])]; renderTags(); } }) });
        setTimeout(() => nameInput.focus(), motionEnabled() ? 350 : 0);
        return h('div', null,
            h('div.mc-wiz-hero', null, picker),
            field({ label: t`Name`, hint: t`Required`, control: nameInput }),
            field({ label: t`Tags`, hint: t`SillyTavern tags for filtering`, control: h('div', null, tagRow, h('div.mc-trait-add', null, tagInput, suggest), list) }),
            suggestWrap,
        );
    }

    /* Step 3: traits */
    function traitsStep() {
        const editor = traitEditor({ avatarId: null, draft: state.traits });
        const wrap = h('div');
        return h('div', null,
            h('p.mc-lead', null, t`Small facts by category. They feed every AI tool and can be compiled into the description.`),
            editor,
            h('div.mc-row-end', null, button({ label: t`Suggest traits with AI`, icon: 'wand-magic-sparkles', kind: 'accent', onClick: () => aiReview({ container: wrap, title: t`Trait ideas`, job: async () => { const found = await ai.suggestTraits({ card: draftCard(state), traits: state.traits }); if (!found.length) throw new Error(t`No usable suggestions came back.`); wrap._found = found; return found.map(x => `• ${x.text}  (${x.category})`).join('\n'); }, onApply: () => { const n = editor.addMany(wrap._found ?? []); toastOk(t`Added ${n} traits`); } }) })),
            wrap,
        );
    }

    /* Step 4: description */
    function descriptionStep() {
        const area = textarea({ value: state.description, rows: 10, placeholder: t`Who is this character? Appearance, background, personality in action, how they speak…`, onInput: (v) => { state.description = v; count(); } });
        const counter = h('span.mc-counter');
        const count = () => { counter.textContent = `${state.description.trim() ? state.description.trim().split(/\s+/).length : 0} ${t`words`}`; };
        count();
        const notes = textarea({ value: '', rows: 2, placeholder: t`Notes for the AI (setting, vibe, things to avoid)…` });
        const wrap = h('div');
        return h('div', null,
            field({ label: t`Description`, hint: counter, control: area }),
            h('div.mc-toolbar', null,
                button({ label: t`Generate from traits`, icon: 'wand-magic-sparkles', kind: 'accent', small: true, onClick: () => aiReview({ container: wrap, title: t`Description`, before: state.description, job: () => ai.fromTraits({ card: draftCard(state), traits: state.traits, notes: notes.value, length: state.length }), onApply: (x) => { state.description = x; area.value = x; count(); flash(area, 'mc-flash-ok'); } }) }),
                button({ label: t`Polish`, icon: 'wand-magic-sparkles', kind: 'ghost', small: true, onClick: () => { if (!state.description.trim()) { toastWarn(t`Write something first`); return; } aiReview({ container: wrap, title: t`Polished`, before: state.description, job: () => ai.enhance({ card: draftCard(state), field: 'description', text: state.description }), onApply: (x) => { state.description = x; area.value = x; count(); } }); } }),
            ),
            field({ label: t`Notes for the AI`, control: notes }),
            wrap,
        );
    }

    /* Step 5: personality + scenario */
    function mindStep() {
        const pers = textarea({ value: state.personality, rows: 4, placeholder: t`Temperament, values, flaws…`, onInput: (v) => { state.personality = v; } });
        const scen = textarea({ value: state.scenario, rows: 4, placeholder: t`Where does the story start, and how does {{user}} fit in?`, onInput: (v) => { state.scenario = v; } });
        const wrap = h('div');
        return h('div', null,
            field({ label: t`Personality`, control: pers }),
            h('div.mc-toolbar', null, button({ label: t`Generate personality`, icon: 'wand-magic-sparkles', kind: 'accent', small: true, onClick: () => aiReview({ container: wrap, title: t`Personality`, before: state.personality, job: () => ai.personalityFromCard({ card: draftCard(state) }), onApply: (x) => { state.personality = x; pers.value = x; flash(pers, 'mc-flash-ok'); } }) })),
            field({ label: t`Scenario`, control: scen }),
            h('div.mc-toolbar', null, button({ label: t`Generate scenario`, icon: 'wand-magic-sparkles', kind: 'accent', small: true, onClick: () => aiReview({ container: wrap, title: t`Scenario`, before: state.scenario, job: () => ai.scenarioFromCard({ card: draftCard(state) }), onApply: (x) => { state.scenario = x; scen.value = x; flash(scen, 'mc-flash-ok'); } }) })),
            wrap,
        );
    }

    /* Step 6: first message + alternates */
    function greetingStep() {
        const area = textarea({ value: state.first_mes, rows: 9, placeholder: t`The opening message, narrated by the character…`, onInput: (v) => { state.first_mes = v; } });
        const lenSeg = segmented({ options: GREETING_LENGTHS, value: state.greetingLength, onChange: (v) => { state.greetingLength = v; } });
        const povSeg = segmented({ options: POVS, value: state.pov, onChange: (v) => { state.pov = v; } });
        const wrap = h('div');
        const altList = h('div.mc-alt-list');
        const renderAlts = () => {
            clear(altList);
            state.alternate_greetings.forEach((g, i) => altList.append(h('div.mc-alt-item', null, h('div.mc-alt-head', null, h('span.mc-alt-num', null, String(i + 1)), h('span.mc-flex1'), button({ label: t`Remove`, icon: 'trash', kind: 'ghost', small: true, onClick: () => { state.alternate_greetings.splice(i, 1); renderAlts(); } })), textarea({ value: g, rows: 4, onInput: (v) => { state.alternate_greetings[i] = v; } }))));
            stagger(altList, 40);
        };
        renderAlts();
        return h('div', null,
            h('p.mc-lead', null, t`The first message sets the scene. The AI writes it from the description, personality and scenario.`),
            h('div.mc-grid2', null, field({ label: t`Length`, control: lenSeg }), field({ label: t`Narration`, control: povSeg })),
            h('div.mc-toolbar', null,
                button({ label: t`Write first message`, icon: 'wand-magic-sparkles', kind: 'accent', className: 'mc-btn-glow', small: true, onClick: () => aiReview({ container: wrap, title: t`First message`, before: state.first_mes, job: () => ai.firstMessage({ card: draftCard(state), length: state.greetingLength, pov: state.pov }), onApply: (x) => { state.first_mes = x; area.value = x; flash(area, 'mc-flash-ok'); } }) }),
                button({ label: t`3 alternate greetings`, icon: 'layer-group', kind: 'ghost', small: true, onClick: () => aiReview({ container: wrap, title: t`Alternate greetings`, job: async () => { const list = await ai.alternateGreetings({ card: draftCard(state), count: 3, length: state.greetingLength, pov: state.pov }); if (!list.length) throw new Error(t`No greetings came back.`); wrap._alts = list; return list.map((x, i) => `${i + 1}. ${x}`).join('\n\n'); }, onApply: () => { state.alternate_greetings.push(...(wrap._alts ?? [])); renderAlts(); } }) }),
            ),
            field({ label: t`First message`, control: area }),
            h('div.mc-section-head', null, h('span.mc-section-title', null, icon('layer-group'), t`Alternate greetings`), h('span.mc-flex1'), button({ label: t`Add`, icon: 'plus', kind: 'ghost', small: true, onClick: () => { state.alternate_greetings.push(''); renderAlts(); } })),
            altList,
            wrap,
        );
    }

    /* Step 7: examples */
    function examplesStep() {
        const area = textarea({ value: state.mes_example, rows: 10, placeholder: '<START>\n{{user}}: …\n{{char}}: …', onInput: (v) => { state.mes_example = v; } });
        const wrap = h('div');
        return h('div', null,
            h('p.mc-lead', null, t`Example dialogues teach the model the character's voice. Optional, but they help a lot with consistency.`),
            h('div.mc-toolbar', null, button({ label: t`Generate 3 examples`, icon: 'wand-magic-sparkles', kind: 'accent', small: true, onClick: () => aiReview({ container: wrap, title: t`Example dialogues`, before: state.mes_example, job: () => ai.exampleDialogues({ card: draftCard(state), count: 3 }), onApply: (x) => { state.mes_example = x; area.value = x; flash(area, 'mc-flash-ok'); }, onAppend: (x) => { state.mes_example = (state.mes_example.trim() ? state.mes_example.trim() + '\n' : '') + x; area.value = state.mes_example; } }) })),
            field({ label: t`Example dialogues`, control: area }),
            wrap,
        );
    }

    /* Step 8: extras */
    function extrasStep() {
        const notes = textarea({ value: state.creator_notes, rows: 3, placeholder: t`Shown to people who download the card…`, onInput: (v) => { state.creator_notes = v; } });
        const books = card.lorebookNames();
        const wrap = h('div');
        return h('div', null,
            field({ label: t`Creator notes`, control: notes }),
            h('div.mc-toolbar', null, button({ label: t`Write notes`, icon: 'wand-magic-sparkles', kind: 'ghost', small: true, onClick: () => aiReview({ container: wrap, title: t`Creator notes`, job: () => ai.suggestCreatorNotes({ card: draftCard(state) }), onApply: (x) => { state.creator_notes = x; notes.value = x; } }) })),
            field({ label: t`Lorebook`, hint: t`Optional world info attached to this character`, control: selectEl({ options: [{ value: '', label: t`None` }, ...books.map(b => ({ value: b, label: b }))], value: state.world, onChange: (v) => { state.world = v; } }) }),
            h('div.mc-toggle-stack', null, toggle({ label: t`Mark as favourite`, checked: state.fav, onChange: (v) => { state.fav = v; } })),
            wrap,
        );
    }

    /* Step 9: review */
    function reviewStep() {
        const preview = h('div.mc-review-card', null,
            h('div.mc-review-top', null, h('img.mc-review-avatar', { src: state.avatar ? URL.createObjectURL(state.avatar) : 'img/ai4.png', alt: '' }), h('div', null, h('div.mc-review-name', null, state.name || '—'), state.tags.length ? h('div.mc-review-title', null, state.tags.join(' · ')) : null)),
            state.traits.length ? h('div.mc-review-chips', null, state.traits.slice(0, 12).map(x => chip({ label: x.text, className: 'mc-chip-static' }))) : null,
            reviewBlock(t`Description`, state.description),
            reviewBlock(t`Personality`, state.personality),
            reviewBlock(t`Scenario`, state.scenario),
            reviewBlock(t`First message`, state.first_mes),
            h('div.mc-review-meta', null,
                h('span', null, icon('layer-group'), `${state.alternate_greetings.length} ${t`alternate greetings`}`),
                h('span', null, icon('comments'), state.mes_example.trim() ? t`Examples set` : t`No examples`),
                state.world ? h('span', null, icon('book'), state.world) : null,
                state.fav ? h('span', null, icon('star'), t`Favourite`) : null,
            ),
        );
        return h('div', null, h('p.mc-lead', null, t`Looks good? The avatar crop dialog opens after you confirm.`), preview);
    }
    function reviewBlock(label, text) {
        return h('div.mc-review-block', null, h('div.mc-review-label', null, label), h('div.mc-review-desc', null, text || h('span.mc-muted', null, t`Empty`)));
    }

    render();
    return sheet;
}

/* ------------------------------------------------------------------ */
/* Refine wizard (one field)                                           */
/* ------------------------------------------------------------------ */

const GOALS = [
    { id: 'enhance', label: t`Polish`, icon: 'wand-magic-sparkles', hint: t`Fix grammar, sharpen wording, keep every fact` },
    { id: 'expand', label: t`Add detail`, icon: 'maximize', hint: t`Roughly double the length with concrete specifics` },
    { id: 'condense', label: t`Shorten`, icon: 'minimize', hint: t`Fewer tokens, same facts` },
    { id: 'tone', label: t`Change tone`, icon: 'palette', hint: t`Rewrite in a different style` },
    { id: 'custom', label: t`Custom`, icon: 'pen-to-square', hint: t`Tell the AI exactly what to change` },
];

export function openRefineWizard({ cardView, fieldKey, fieldLabel, text, traits, historyKey, onApply }) {
    let goal = 'enhance', tone = 'vivid', focus = '', instruction = '', target = 120, index = 0, dir = 1;
    const sheet = openSheet({ title: `${t`Adjust`}: ${fieldLabel}`, subtitle: t`What should change?` });
    if (!text.trim()) {
        sheet.setStep(h('div', null, h('p.mc-lead', null, t`This field is empty. Generate something first.`)));
        sheet.setFooter(h('span.mc-flex1'), button({ label: t`Close`, kind: 'primary', onClick: () => sheet.close() }));
        return sheet;
    }
    function render() {
        sheet.setProgress((index + 1) / 3);
        if (index === 0) {
            const grid = h('div.mc-goal-grid');
            for (const g of GOALS) grid.append(h('button.mc-goal', { type: 'button', class: g.id === goal ? 'is-active' : '', onClick: () => { goal = g.id; render(); } }, h('span.mc-goal-icon', null, icon(g.icon)), h('span.mc-goal-label', null, g.label), h('span.mc-goal-hint', null, g.hint)));
            sheet.setStep(h('div', null, stepDots(3, 0), grid), dir);
            requestAnimationFrame(() => stagger(grid, 35, 260));
            sheet.setFooter(h('span.mc-flex1'), button({ label: t`Continue`, icon: 'arrow-right', kind: 'primary', onClick: () => { dir = 1; index = 1; render(); } }));
        } else if (index === 1) {
            let content;
            if (goal === 'tone') { const row = h('div.mc-tone-grid'); for (const tn of TONES) row.append(h('button.mc-goal.mc-goal-sm', { type: 'button', class: tn.id === tone ? 'is-active' : '', onClick: () => { tone = tn.id; render(); } }, h('span.mc-goal-label', null, tn.label), h('span.mc-goal-hint', null, tn.hint))); content = h('div', null, h('p.mc-lead', null, t`Pick a tone.`), row); }
            else if (goal === 'custom') content = h('div', null, field({ label: t`Instruction`, control: textarea({ value: instruction, rows: 4, placeholder: t`e.g. Make him ten years older and give him a limp from an old injury`, onInput: (v) => { instruction = v; } }) }));
            else if (goal === 'expand') content = h('div', null, field({ label: t`Focus (optional)`, control: input({ value: focus, placeholder: t`e.g. voice and mannerisms`, onInput: (v) => { focus = v; } }) }));
            else if (goal === 'condense') content = h('div', null, field({ label: t`Target length`, control: segmented({ options: [{ value: 60, label: '~60' }, { value: 120, label: '~120' }, { value: 200, label: '~200' }], value: target, onChange: (v) => { target = Number(v); } }) }));
            else content = h('div', null, h('p.mc-lead', null, t`Polish keeps every fact and roughly the same length. Nothing to configure.`));
            sheet.setStep(h('div', null, stepDots(3, 1), content), dir);
            sheet.setFooter(button({ label: t`Back`, icon: 'arrow-left', kind: 'ghost', onClick: () => { dir = -1; index = 0; render(); } }), h('span.mc-flex1'), button({ label: t`Run`, icon: 'wand-magic-sparkles', kind: 'accent', className: 'mc-btn-glow', onClick: () => { if (goal === 'custom' && !instruction.trim()) { toastWarn(t`Write an instruction first`); return; } dir = 1; index = 2; render(); } }));
        } else {
            const wrap = h('div');
            sheet.setStep(h('div', null, stepDots(3, 2), wrap), dir);
            const base = { card: cardView, field: fieldKey, text, traits };
            const job = () => goal === 'expand' ? ai.expand({ ...base, focus }) : goal === 'condense' ? ai.condense({ ...base, target }) : goal === 'tone' ? ai.retone({ ...base, tone }) : goal === 'custom' ? ai.custom({ ...base, instruction }) : ai.enhance(base);
            aiReview({ container: wrap, title: GOALS.find(g => g.id === goal)?.label ?? t`Result`, before: text, job, onApply: async (x) => { if (historyKey) pushHistory(historyKey, text, `${t`Before`}: ${GOALS.find(g => g.id === goal)?.label ?? ''}`); await onApply(x); sheet.close(); } });
            sheet.setFooter(button({ label: t`Back`, icon: 'arrow-left', kind: 'ghost', onClick: () => { dir = -1; index = 1; render(); } }), h('span.mc-flex1'));
        }
    }
    render();
    return sheet;
}

/* ------------------------------------------------------------------ */
/* Interview wizard                                                    */
/* ------------------------------------------------------------------ */

const QUESTIONS = [
    { question: t`What does {{user}} notice first about this character?`, placeholder: t`Looks, posture, voice, a scar…` },
    { question: t`Who are they in this world? Age, role, where they come from.`, placeholder: t`A 40-year-old lighthouse keeper from…` },
    { question: t`Describe their temperament, including one real flaw.`, placeholder: t`Dry humour, protective, lies when cornered…` },
    { question: t`How do they talk? Accent, habits, favourite phrases.`, placeholder: t`Short sentences, old sailor slang…` },
    { question: t`What in their past still shapes them?`, placeholder: t`Lost a crew at sea, never speaks of it…` },
    { question: t`What do they want from {{user}}, and what are they afraid of?`, placeholder: t`Company; being found out…` },
    { question: t`How does the story start between them?`, placeholder: t`{{user}} is stranded at the lighthouse during a storm…` },
];

export function openInterviewWizard({ name = '', onResult }) {
    const answers = QUESTIONS.map(q => ({ ...q, answer: '' }));
    const extra = [];
    let index = 0, dir = 1, length = 'medium';
    const sheet = openSheet({ title: t`Interview`, subtitle: t`Describe the character in your own words. Skip anything.` });
    const all = () => [...answers, ...extra];
    function render() {
        const list = all();
        sheet.setProgress((index + 1) / (list.length + 1));
        if (index < list.length) {
            const q = list[index];
            const area = textarea({ value: q.answer, rows: 4, placeholder: q.placeholder ?? '', onInput: (v) => { q.answer = v; } });
            setTimeout(() => area.focus(), motionEnabled() ? 350 : 0);
            sheet.setTitle(t`Interview`, `${t`Question`} ${index + 1} / ${list.length}`);
            sheet.setStep(h('div.mc-interview', null, h('div.mc-interview-q', null, h('span.mc-interview-num', null, String(index + 1)), h('span', null, q.question)), area), dir);
            const more = (index === list.length - 1 && extra.length < 6) ? button({ label: t`Ask me more`, icon: 'comments', kind: 'accent', onClick: async (ev) => { const b = ev.currentTarget; b.disabled = true; b.classList.add('is-loading'); try { const qs = await ai.followUpQuestions({ name, answers: all(), count: 3 }); if (!qs.length) { toastWarn(t`No follow-up questions came back`); return; } for (const qq of qs) extra.push({ question: qq, answer: '' }); dir = 1; index++; render(); } catch (err) { toastErr(err?.message ?? String(err)); } finally { b.disabled = false; b.classList.remove('is-loading'); } } }) : null;
            sheet.setFooter(button({ label: t`Back`, icon: 'arrow-left', kind: 'ghost', disabled: index === 0, onClick: () => { dir = -1; index--; render(); } }), button({ label: t`Skip`, icon: 'forward', kind: 'ghost', onClick: () => { dir = 1; index++; render(); } }), h('span.mc-flex1'), more, button({ label: index === list.length - 1 ? t`Finish` : t`Next`, icon: 'arrow-right', kind: 'primary', onClick: () => { dir = 1; index++; render(); } }));
        } else {
            sheet.setTitle(t`Interview`, t`Compose the description`);
            const wrap = h('div');
            const answered = list.filter(a => a.answer.trim()).length;
            sheet.setStep(h('div', null,
                h('p.mc-lead', null, `${answered} ${t`of`} ${list.length} ${t`questions answered.`}`),
                field({ label: t`Length`, control: segmented({ options: LENGTHS, value: length, onChange: (v) => { length = v; } }) }),
                h('div.mc-row-end', null, button({ label: t`Write it`, icon: 'wand-magic-sparkles', kind: 'accent', className: 'mc-btn-glow', onClick: () => aiReview({ container: wrap, title: t`Description`, job: () => ai.fromInterview({ name, answers: list, length }), onApply: async (x) => { await onResult(x); sheet.close(); } }) })),
                wrap,
            ), dir);
            sheet.setFooter(button({ label: t`Back`, icon: 'arrow-left', kind: 'ghost', onClick: () => { dir = -1; index--; render(); } }), h('span.mc-flex1'));
        }
    }
    render();
    return sheet;
}
