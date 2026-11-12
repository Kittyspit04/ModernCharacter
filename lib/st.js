/**
 * Bridge to SillyTavern internals.
 * Path note: this file lives at
 *   public/scripts/extensions/third-party/ModernCharacter/lib/st.js
 */
import {
    saveCharacterDebounced,
    createOrEditCharacter,
    deleteCharacter,
    duplicateCharacter,
    renameCharacter,
    printCharacters,
    default_avatar,
    talkativeness_default,
    depth_prompt_depth_default,
    depth_prompt_role_default,
} from '../../../../../script.js';
import { charUpdatePrimaryWorld } from '../../../../world-info.js';
import { tags, tag_map, getTagsList, removeTagFromMap, appendTagToList } from '../../../../tags.js';

export const MODULE_NAME = 'modernCharacter';

/** @returns {ReturnType<typeof SillyTavern.getContext>} */
export function ctx() {
    return SillyTavern.getContext();
}

export const st = {
    saveCharacterDebounced,
    createOrEditCharacter,
    deleteCharacter,
    duplicateCharacter,
    renameCharacter,
    printCharacters,
    charUpdatePrimaryWorld,
    default_avatar,
    talkativeness_default,
    depth_prompt_depth_default,
    depth_prompt_role_default,
    tags,
    tag_map,
    getTagsList,
    removeTagFromMap,
    appendTagToList,
};

export function events() {
    const c = ctx();
    return { source: c.eventSource, types: c.eventTypes ?? c.event_types };
}

export function toast() {
    return globalThis.toastr;
}

export function t(strings, ...values) {
    try { return ctx().t(strings, ...values); } catch { return String.raw({ raw: strings }, ...values); }
}

export function isMobileLayout() {
    try { if (ctx().isMobile()) return true; } catch { /* ignore */ }
    return window.matchMedia('(max-width: 1000px)').matches;
}

/** The persona the user plays right now (name + description), for prompts. */
export function userPersona() {
    const c = ctx();
    return { name: c.name1 || 'the user', description: String(c.powerUserSettings?.persona_description ?? '') };
}
