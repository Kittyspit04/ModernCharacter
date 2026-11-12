/**
 * AI helpers for character cards. Everything runs through SillyTavern's
 * `generateRaw`, so the connected API and model are used as-is.
 */
import { ctx, events, userPersona } from './st.js';
import { settings, TONES } from './settings.js';
import { CATEGORIES, traitsForPrompt } from './traits.js';

let activeJobs = 0;
export function isBusy() { return activeJobs > 0; }

function languageLine() {
    const lang = settings().ai.language?.trim();
    return lang ? `Write in ${lang}.` : 'Write in the same language as the source material.';
}

/** Compact summary of the card for prompts. */
function cardBlock(card, { include = ['description', 'personality', 'scenario'], maxPerField = 1800 } = {}) {
    const f = card.fields ?? card;
    const name = f.name || '{{char}}';
    const lines = [`Character name: ${name}`];
    const labels = { description: 'Description', personality: 'Personality', scenario: 'Scenario', first_mes: 'Current first message', mes_example: 'Example dialogues', creator_notes: 'Creator notes' };
    for (const key of include) {
        const value = String(f[key] ?? '').trim();
        if (value) lines.push(`${labels[key] ?? key}:\n"""${value.slice(0, maxPerField)}"""`);
    }
    if (settings().ai.includePersona) {
        const p = userPersona();
        if (p.description.trim()) lines.push(`The player's character ({{user}}), for context only:\nName: ${p.name}\n"""${p.description.slice(0, 600)}"""`);
    }
    return lines.join('\n\n');
}

export async function run(prompt, { length, system } = {}) {
    const c = ctx();
    const s = settings();
    activeJobs++;
    document.body.classList.add('mc-ai-busy');
    try {
        const text = await c.generateRaw({ prompt, systemPrompt: system ?? s.ai.systemPrompt, responseLength: length ?? s.ai.responseLength });
        return cleanOutput(text);
    } finally {
        activeJobs--;
        if (activeJobs <= 0) { activeJobs = 0; document.body.classList.remove('mc-ai-busy'); }
    }
}

export function stop() {
    try { ctx().stopGeneration(); } catch { /* ignore */ }
}

export function cleanOutput(text) {
    let out = String(text ?? '').trim();
    out = out.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    if (/^["“][\s\S]*["”]$/.test(out) && !out.slice(1, -1).includes('"')) out = out.slice(1, -1).trim();
    out = out.replace(/^(here( is|'s) (the|your|a|an) [^:\n]{0,70}:\s*)/i, '').trim();
    return out;
}

const LENGTH_WORDS = { short: 'about 90 words', medium: 'about 200 words', long: 'about 350 words', epic: 'about 550 words' };

/* ------------------------------------------------------------------ */
/* Greetings                                                           */
/* ------------------------------------------------------------------ */

/** The headline feature: a first message from description, personality and scenario. */
export function firstMessage({ card, length = 'medium', pov = 'third', style = '', avoid = '' }) {
    const povLine = pov === 'second'
        ? 'Narration addresses the player as "you".'
        : pov === 'first'
            ? `Narration is in first person from ${card.fields?.name || '{{char}}'}'s point of view.`
            : `Narration is in third person; ${card.fields?.name || '{{char}}'} is "she/he/they" or their name.`;
    return run(`${cardBlock(card)}

Task: Write the opening message of a roleplay chat, spoken and narrated by ${card.fields?.name || '{{char}}'}. It establishes the scenario in a concrete moment (place, time, sensory detail), shows personality through action and voice rather than explanation, and ends with a hook that invites {{user}} to respond. Refer to the player only as {{user}}. Do not write {{user}}'s actions, thoughts or words. ${povLine} Use *asterisks* for actions and narration and plain quotation marks for speech. ${style ? `Style: ${style}.` : ''} ${avoid ? `Avoid: ${avoid}.` : ''} Length: ${LENGTH_WORDS[length] ?? LENGTH_WORDS.medium}. ${languageLine()}

Return only the message.`, { length: Math.max(settings().ai.responseLength, length === 'epic' ? 1200 : 800) });
}

/** Several alternate greetings with different situations. */
export async function alternateGreetings({ card, count = 3, length = 'medium', pov = 'third' }) {
    const povLine = pov === 'second' ? 'Narration addresses the player as "you".' : pov === 'first' ? 'First-person narration from the character.' : 'Third-person narration.';
    const raw = await run(`${cardBlock(card, { include: ['description', 'personality', 'scenario', 'first_mes'] })}

Task: Write ${count} alternative opening messages for this character. Each one starts the roleplay in a clearly different situation, mood or time (for example a different place, a different first encounter, a tense moment versus a calm one), and none repeats the current first message. Each is narrated by the character, refers to the player only as {{user}}, never acts or speaks for {{user}}, uses *asterisks* for actions and quotation marks for speech, and ends with a hook. ${povLine} Length of each: ${LENGTH_WORDS[length] ?? LENGTH_WORDS.medium}. ${languageLine()}

Respond with a JSON array of ${count} strings and nothing else.`, { length: Math.max(settings().ai.responseLength, 500 * count), system: 'You output strictly valid JSON and nothing else. Escape newlines inside strings as \\n.' });
    const list = parseJsonArray(raw).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());
    if (list.length) return list;
    // Fallback: split on separators if the model ignored JSON
    const parts = String(raw).split(/\n\s*(?:---+|===+|\d+[.)])\s*\n?/).map(x => x.trim()).filter(x => x.length > 40);
    return parts.slice(0, count);
}

/* ------------------------------------------------------------------ */
/* Card fields                                                         */
/* ------------------------------------------------------------------ */

export function personalityFromCard({ card, length = 'short' }) {
    return run(`${cardBlock(card, { include: ['description', 'scenario', 'first_mes'] })}

Task: Write the Personality field for this character: a compact summary of temperament, values, habits, strengths, flaws and how they treat others, consistent with the description. Prefer concrete, specific traits over adjectives lists. Format: one tight paragraph or a comma-separated list of short trait phrases. Length: ${length === 'short' ? 'about 60 words' : 'about 120 words'}. ${languageLine()}

Return only the personality text.`, { length: 300 });
}

export function scenarioFromCard({ card, length = 'short' }) {
    return run(`${cardBlock(card, { include: ['description', 'personality', 'first_mes'] })}

Task: Write the Scenario field for this character: the situation in which the roleplay starts, where {{user}} and {{char}} are, how they relate to each other, and what is at stake. Keep it open enough for many conversations. Length: ${length === 'short' ? 'about 60 words' : 'about 120 words'}. ${languageLine()}

Return only the scenario text.`, { length: 300 });
}

export function exampleDialogues({ card, count = 3 }) {
    return run(`${cardBlock(card, { include: ['description', 'personality', 'scenario'] })}

Task: Write ${count} short example dialogues that teach a language model how this character talks: vocabulary, rhythm, humour, how they handle being challenged, flirted with or asked for help. Each example is 3 to 6 lines alternating between {{user}} and {{char}}, with actions in *asterisks*. Keep {{user}}'s lines short and neutral so the focus is on {{char}}.

Format exactly like this, with a line containing only <START> before every example:
<START>
{{user}}: ...
{{char}}: ...

${languageLine()}
Return only the examples.`, { length: Math.max(settings().ai.responseLength, 700) });
}

export function suggestCreatorNotes({ card }) {
    return run(`${cardBlock(card, { include: ['description', 'personality', 'scenario', 'first_mes'] })}

Task: Write short creator notes shown to people who download this card: one or two sentences about who the character is and the kind of story they fit, one sentence on tone or content expectations, and one tip for playing with them. Plain text, no headings. ${languageLine()}

Return only the notes.`, { length: 200 });
}

/** Whole card from a one-line concept. */
export async function cardFromConcept({ concept, name = '', length = 'medium', traits = [] }) {
    const traitText = traitsForPrompt(traits);
    const raw = await run(`Create a complete roleplay character card from this concept:
"""${concept}"""
${name ? `The character's name is ${name}.` : 'Invent a fitting name.'}
${traitText ? `Required traits:\n${traitText}` : ''}

Write these fields:
- name: the character's name.
- description: an information-dense third-person profile (appearance, background, personality in action, relationships, speech patterns), ${length === 'short' ? 'about 150 words' : length === 'long' ? 'about 400 words' : 'about 250 words'}.
- personality: a compact list of trait phrases, about 40 words.
- scenario: where the story starts and how {{user}} fits in, about 60 words.
- first_mes: the opening message narrated by the character, with *asterisks* for actions and quotes for speech, ending with a hook, referring to the player only as {{user}} and never acting for {{user}}, about 180 words.
- tags: 4 to 8 short lowercase tags (genre, archetype, setting, tone).
- creator_notes: one or two sentences for people who download the card.
${languageLine()}

Respond with a single JSON object with exactly those keys and nothing else. Escape newlines inside strings as \\n.`, { length: Math.max(settings().ai.responseLength, 1600), system: 'You output strictly valid JSON and nothing else.' });
    const obj = parseJsonObject(raw);
    if (!obj) throw new Error('The model did not return a usable card. Try again or shorten the concept.');
    return {
        name: String(obj.name ?? name ?? '').trim(),
        description: String(obj.description ?? '').trim(),
        personality: String(obj.personality ?? '').trim(),
        scenario: String(obj.scenario ?? '').trim(),
        first_mes: String(obj.first_mes ?? '').trim(),
        tags: Array.isArray(obj.tags) ? obj.tags.map(x => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 10) : [],
        creator_notes: String(obj.creator_notes ?? '').trim(),
    };
}

/* ------------------------------------------------------------------ */
/* Generic field tools                                                 */
/* ------------------------------------------------------------------ */

function fieldBlock(card, field, text) {
    return `${cardBlock(card, { include: ['description', 'personality', 'scenario'].filter(x => x !== field) })}\n\nField being edited: ${field}\nCurrent text:\n"""${text || '(empty)'}"""`;
}

export function enhance({ card, field, text }) {
    return run(`${fieldBlock(card, field, text)}

Task: Polish this text. Fix spelling and grammar, remove repetition, make every sentence specific and vivid, keep every fact and the format (prose stays prose, lists stay lists, {{char}}/{{user}} macros stay). Keep roughly the same length. ${languageLine()}

Return only the improved text.`);
}

export function expand({ card, field, text, traits = [], focus = '' }) {
    const traitText = traitsForPrompt(traits);
    return run(`${fieldBlock(card, field, text)}
${traitText ? `\nKnown traits (must stay true):\n${traitText}\n` : ''}
Task: Expand this text to roughly twice its length with concrete, specific detail${focus ? ` focused on ${focus}` : ''}. Never contradict the other fields or the traits. Keep the format and the macros. ${languageLine()}

Return only the expanded text.`, { length: Math.max(settings().ai.responseLength, 800) });
}

export function condense({ card, field, text, target = 120 }) {
    return run(`${fieldBlock(card, field, text)}

Task: Rewrite this text to use as few tokens as possible while keeping every important fact. Aim for about ${target} words or fewer. ${languageLine()}

Return only the condensed text.`, { length: 400 });
}

export function retone({ card, field, text, tone }) {
    const preset = TONES.find(x => x.id === tone) ?? TONES[0];
    return run(`${fieldBlock(card, field, text)}

Task: Rewrite this text in a ${preset.label.toLowerCase()} style (${preset.hint.toLowerCase()}). Keep every fact, the format, the macros and roughly the same length. ${languageLine()}

Return only the rewritten text.`);
}

export function custom({ card, field, text, instruction, traits = [] }) {
    const traitText = traitsForPrompt(traits);
    return run(`${fieldBlock(card, field, text)}
${traitText ? `\nKnown traits:\n${traitText}\n` : ''}
Task: Edit the text following this instruction exactly: "${instruction}". Unless told otherwise, keep all other facts, the format and the length. ${languageLine()}

Return only the edited text.`);
}

export function fromTraits({ card, traits = [], notes = '', length = 'medium' }) {
    return run(`Create the Description field for a roleplay character.
Name: ${card.fields?.name || '{{char}}'}
${traits.length ? `Traits:\n${traitsForPrompt(traits)}` : 'Traits: (none given, invent a coherent, interesting character)'}
${notes ? `Notes from the author:\n"""${notes}"""` : ''}
${card.fields?.scenario ? `Scenario they live in:\n"""${String(card.fields.scenario).slice(0, 600)}"""` : ''}

Format: information-dense third-person prose, one to three paragraphs: appearance, background, personality shown through behaviour, relationships, how they speak. Use every trait. Length: ${length === 'short' ? 'about 120 words' : length === 'long' ? 'about 350 words' : 'about 220 words'}. ${languageLine()}

Return only the description.`, { length: Math.max(settings().ai.responseLength, 700) });
}

/* ------------------------------------------------------------------ */
/* Analysis                                                            */
/* ------------------------------------------------------------------ */

export async function suggestTags({ card }) {
    const raw = await run(`${cardBlock(card)}

Task: Suggest 6 to 10 short lowercase tags for this character card: genre, setting, archetype, tone, relationship type. One to three words each.

Respond with a JSON array of strings only.`, { length: 150, system: 'You output strictly valid JSON and nothing else.' });
    return parseJsonArray(raw).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().toLowerCase()).slice(0, 10);
}

export async function suggestTraits({ card, traits = [], count = 8 }) {
    const categories = CATEGORIES.map(c => c.id).join(', ');
    const raw = await run(`${cardBlock(card)}
${traits.length ? `\nExisting traits:\n${traitsForPrompt(traits)}\n` : ''}
Task: Suggest ${count} new, specific traits that would make this character more interesting and consistent. Spread them over different categories. Each trait is a short phrase of at most 10 words.
Allowed categories: ${categories}. ${languageLine()}

Respond with a JSON array only, in this exact shape:
[{"category":"personality","text":"Laughs at her own bad jokes"}]`, { length: 400, system: 'You output strictly valid JSON and nothing else.' });
    return parseTraitJson(raw);
}

export async function extractTraits({ card }) {
    const categories = CATEGORIES.map(c => c.id).join(', ');
    const raw = await run(`${cardBlock(card)}

Task: Extract every distinct fact about the character as a trait: a short phrase of at most 12 words, assigned to one category. Do not invent anything.
Allowed categories: ${categories}.

Respond with a JSON array only, in this exact shape:
[{"category":"appearance","text":"Short silver hair"}]`, { length: 800, system: 'You output strictly valid JSON and nothing else.' });
    return parseTraitJson(raw);
}

export function consistencyCheck({ card }) {
    return run(`${cardBlock(card, { include: ['description', 'personality', 'scenario', 'first_mes', 'mes_example'], maxPerField: 2500 })}

Task: Review this character card like an editor. List, as short bullet points: (1) contradictions between fields, (2) important things that are missing for a good roleplay (voice, motivation, flaw, relationship to {{user}}, concrete setting), (3) places where the first message speaks or acts for {{user}}, (4) wasted tokens (repetition, filler). Be specific and quote the offending phrase where useful. If something is fine, say so briefly. ${languageLine()}

Return only the bullet list.`, { length: 600 });
}

export function fromInterview({ name, answers, length = 'medium' }) {
    const qa = answers.filter(a => a.answer?.trim()).map(a => `Q: ${a.question}\nA: ${a.answer.trim()}`).join('\n\n');
    return run(`Create the Description field for a roleplay character named ${name || '{{char}}'} from this interview with the author.

${qa || '(No answers given. Invent a coherent, interesting character.)'}

Format: information-dense third-person prose, one to three paragraphs. Keep every fact the author gave, fill small gaps tastefully, do not contradict anything. Length: ${length === 'short' ? 'about 120 words' : length === 'long' ? 'about 350 words' : 'about 220 words'}. ${languageLine()}

Return only the description.`, { length: Math.max(settings().ai.responseLength, 700) });
}

export async function followUpQuestions({ name, answers, count = 3 }) {
    const qa = answers.filter(a => a.answer?.trim()).map(a => `Q: ${a.question}\nA: ${a.answer.trim()}`).join('\n');
    const raw = await run(`An author is describing a roleplay character named ${name || '{{char}}'}. So far:

${qa || '(nothing yet)'}

Task: Ask ${count} short follow-up questions that would uncover the most interesting missing details (contradictions, secrets, sensory specifics, how they treat strangers, what they want from {{user}}). One sentence each. ${languageLine()}

Respond with a JSON array of strings only.`, { length: 250, system: 'You output strictly valid JSON and nothing else.' });
    return parseJsonArray(raw).filter(x => typeof x === 'string' && x.trim()).slice(0, count);
}

export function suggestTitleName({ concept }) {
    return run(`Suggest one fitting name for a roleplay character based on this concept: """${concept}""". Return only the name, at most three words.`, { length: 20 });
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

function parseJsonArray(raw) {
    const text = String(raw ?? '');
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start < 0 || end <= start) return [];
    try { const parsed = JSON.parse(text.slice(start, end + 1)); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function parseJsonObject(raw) {
    const text = String(raw ?? '');
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    try { const parsed = JSON.parse(text.slice(start, end + 1)); return parsed && typeof parsed === 'object' ? parsed : null; } catch { return null; }
}

function parseTraitJson(raw) {
    const allowed = new Set(CATEGORIES.map(c => c.id));
    return parseJsonArray(raw)
        .filter(x => x && typeof x === 'object' && typeof x.text === 'string' && x.text.trim())
        .map(x => ({ category: allowed.has(String(x.category).toLowerCase()) ? String(x.category).toLowerCase() : 'custom', text: String(x.text).trim().replace(/\.$/, '') }));
}

export function onGenerationEnd(callback) {
    const { source, types } = events();
    const handler = () => callback();
    source.on(types.GENERATION_ENDED, handler);
    source.on(types.GENERATION_STOPPED, handler);
    return () => { source.removeListener(types.GENERATION_ENDED, handler); source.removeListener(types.GENERATION_STOPPED, handler); };
}
