/**
 * Modern Character — a sleek character creator and editor for SillyTavern.
 * Replaces the stock character form inside the right navigation drawer.
 */
import { createPanel } from './ui/panel.js';
import { settings, setSetting } from './lib/settings.js';
import { events, ctx, t } from './lib/st.js';
import { h, button } from './ui/dom.js';

const NATIVE_ID = 'rm_ch_create_block';
const ROOT_ID = 'mc-root';
let panel = null;
let root = null;

function nativeBlock() { return document.getElementById(NATIVE_ID); }

function isNativeVisible() {
    const el = nativeBlock();
    return !!el && el.style.display !== 'none' && el.style.display !== '';
}

function applyVisibility() {
    const native = nativeBlock();
    if (!native || !root) return;
    const replace = settings().replaceNative;
    const visible = isNativeVisible();
    document.body.classList.toggle('mc-replacing', replace);
    native.classList.toggle('mc-native-hidden', replace && visible);
    const show = replace && visible;
    document.body.classList.toggle('mc-open', show);
    if (show && root.style.display === 'none') { root.style.display = ''; panel.render(); }
    else if (show) panel.sync();
    if (!show) root.style.display = 'none';
}

function injectRoot() {
    const native = nativeBlock();
    if (!native) throw new Error('rm_ch_create_block not found');
    root = h('div', { id: ROOT_ID, style: { display: 'none' } });
    native.insertAdjacentElement('afterend', root);
    panel = createPanel(root);
    new MutationObserver(applyVisibility).observe(native, { attributes: true, attributeFilter: ['style'] });
    applyVisibility();
}

function injectSettingsBlock() {
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host || document.getElementById('mc-ext-settings')) return;
    const s = settings();
    const replaceInput = h('input', { type: 'checkbox', checked: s.replaceNative, onChange: (ev) => { setSetting('replaceNative', ev.target.checked); applyVisibility(); } });
    const animInput = h('input', { type: 'checkbox', checked: s.animations, onChange: (ev) => { setSetting('animations', ev.target.checked); document.body.classList.toggle('mc-no-motion', !ev.target.checked); } });
    host.append(h('div.inline-drawer#mc-ext-settings', null,
        h('div.inline-drawer-toggle.inline-drawer-header', null, h('b', null, 'Modern Character'), h('div.inline-drawer-icon.fa-solid.fa-circle-chevron-down.down')),
        h('div.inline-drawer-content', null,
            h('label.checkbox_label', null, replaceInput, h('span', null, t`Replace the built-in character editor`)),
            h('label.checkbox_label', null, animInput, h('span', null, t`Enable animations`)),
            h('div.flex-container.marginTop10', null, button({ label: t`New character wizard`, icon: 'wand-magic-sparkles', kind: 'primary', small: true, onClick: () => { openEditor(); panel?.openCreate(); } })),
            h('small.mc-muted', null, t`More options live in the editor's Settings tab.`),
        ),
    ));
}

/** Open the right drawer (character panel). */
function openEditor() {
    const content = document.getElementById('right-nav-panel');
    if (content && !content.classList.contains('openDrawer')) document.getElementById('rightNavDrawerIcon')?.click();
}

function registerSlashCommands() {
    const c = ctx();
    try {
        c.SlashCommandParser.addCommandObject(c.SlashCommand.fromProps({
            name: 'character-studio',
            aliases: ['modern-character', 'mchar'],
            callback: async (_args, value) => {
                const action = String(value ?? '').trim().toLowerCase();
                openEditor();
                if (action === 'new' || action === 'create') panel?.openCreate();
                else if (['card', 'greetings', 'traits', 'ai', 'advanced', 'settings'].includes(action)) panel?.setTab(action);
                return '';
            },
            unnamedArgumentList: [c.SlashCommandArgument.fromProps({ description: 'new | card | greetings | traits | ai | advanced | settings', typeList: [c.ARGUMENT_TYPE.STRING], isRequired: false })],
            helpString: 'Opens the Modern Character editor. <code>new</code> starts the creation wizard; a tab name jumps to that tab.',
        }));
    } catch (err) { console.warn('[ModernCharacter] slash command registration failed', err); }
}

function boot() {
    const s = settings();
    document.body.classList.toggle('mc-no-motion', !s.animations);
    injectRoot();
    injectSettingsBlock();
    registerSlashCommands();
    const { source, types } = events();
    source.on(types.APP_READY, applyVisibility);
    console.log('[ModernCharacter] ready');
}

jQuery(() => { try { boot(); } catch (err) { console.error('[ModernCharacter] failed to start', err); } });

export { openEditor };
