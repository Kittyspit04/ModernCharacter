# Modern Character

A sleek, animated character creator and editor for [SillyTavern](https://github.com/SillyTavern/SillyTavern).
It replaces the stock character form inside the Character Management drawer with a modern editor:
hero card, tabs, trait management, AI tools that write first messages, greetings, example dialogues and
more, plus step-by-step wizards. Same design language as
[Modern Persona](https://github.com/Kittyspit04/ModernPersona); when
[Modern Mobile UI](https://github.com/Kittyspit04/ModernMobileUI) is installed, its appearance mode, accent
colour and font apply here too.

## Install

1. In SillyTavern open **Extensions** (the cubes icon) → **Install extension**.
2. Paste the repository URL:

   ```
   https://github.com/Kittyspit04/ModernCharacter
   ```

3. Install and let the page reload. Open the character panel (the address-card icon), pick a character or
   press the create button, and the new editor appears in place of the old form.

Requires a recent SillyTavern release (1.13 or newer). AI tools use whatever API and model you are
connected to.

## How it fits into SillyTavern

The character list, groups, tags and favourites stay exactly as they are. Only the editing form is
replaced. Under the hood the editor writes through SillyTavern's own form and save path, so autosave,
export, backups, the advanced-definitions popup, slash commands and other extensions all see the same
data. Turn **Replace the built-in character editor** off in the Settings tab to get the stock form back.

## What you get

### Hero card
Large avatar (tap to change, with the crop dialog), inline rename, tag chips with add/remove,
favourite star, badges for autosave or draft state, linked lorebook, greeting count and permanent token
count. A menu offers duplicate, export, convert to persona, interview-to-rewrite and delete.

### Tabs
- **Card**: description, personality and scenario, each with live word and token counts, *Polish*,
  *Adjust…* (refine wizard), *History* (restore earlier versions) and a generate button.
- **Greetings**: the first message with **Write first message** (from description, personality and
  scenario, with length and narration options and a style hint), alternate greetings with generate,
  polish, reorder and delete, and example dialogues with a generator that writes proper `<START>` blocks.
- **Traits**: facts grouped by category, quick-add presets, AI suggestions, extraction from the card,
  and writing traits into the description as a compact list or AI prose.
- **AI**: first message, alternate greetings, example dialogues, personality, scenario, consistency check
  (an editor's review of contradictions, gaps and wasted tokens), tag suggestions, creator notes,
  interview, tone rewrites and custom instructions for any field.
- **Advanced**: creator notes, lorebook link plus the auxiliary lorebook dialog, creator and version,
  embedded tags, character note with depth and role, talkativeness, system prompt and post-history
  overrides.
- **Settings**: replace toggle, animations, word reveal, AI options and the system prompt.

### Wizards
- **Guided create**: concept (optionally let the AI draft the entire card from one paragraph), name and
  avatar and tags, traits, description, personality and scenario, first message and alternate greetings,
  example dialogues, extras, review, create. The new character opens in the editor afterwards.
- **Adjust**: polish, add detail, shorten, change tone or a custom instruction for one field, with a
  before/after compare and undo through history.
- **Interview**: answer questions about the character, let the AI ask follow-ups, get a description.

### Animations
The same springy motion as Modern Persona: hero and sections rise in, sliding tab indicator, wizard
steps slide, AI results reveal word by word with a breathing orb and shimmer while thinking, and the
character icon in the top bar pulses during generation. Reduced motion is respected; Modern Mobile UI's
animation switch also turns motion off here.

## Slash command

```
/character-studio          open the character panel
/character-studio new      start the creation wizard
/character-studio ai       jump to a tab (card, greetings, traits, ai, advanced, settings)
```

Aliases: `/modern-character`, `/mchar`.

## Where data lives

Card fields, greetings, tags and lorebook links are regular SillyTavern character data. Traits, version
history and the extension's options are stored in `extension_settings.modernCharacter`.

## Development notes

- `index.js` – injects the editor next to the stock form and shows it whenever SillyTavern shows that form.
- `lib/st.js` – the only file that imports SillyTavern internals.
- `lib/card.js` – reads the card and writes through the native inputs, greetings array, tag map and lorebook helpers.
- `lib/ai.js` – prompts for every AI tool.
- `ui/` – DOM toolkit, widgets, the panel and the wizards (shared design with Modern Persona).
- `style.css` – tokens, keyframes, layout; honours `--cai-*` variables from Modern Mobile UI.

## License

MIT
