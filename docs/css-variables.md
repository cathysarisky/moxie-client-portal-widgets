# Portal CSS variables

**Don't use this if you want to have all your portals be the same color scheme.  Define a (brand kit)[https://help.withmoxie.com/en/articles/16930603-build-and-apply-your-brand-across-moxie-with-brand-kits] instead within the Moxie dashboard.  Use these variables when you need to give each client their OWN brand colors, so one brand kit won't do.**

The Moxie client portal takes its look from CSS variables. Most of them come from your workspace's brand kit and are written as an inline style on the app container, the `<div id="app">` that holds the whole portal; a few more are worked out from those. Setting a variable with the [custom-css snippet](../README.md#custom-css) changes everything that uses it, which is usually tidier than overriding individual elements.

The example values below are from one workspace, using my brand kit.

## How to change a variable

Put a rule for `#app` in the `CSS` list of the custom-css snippet and keep the `!important`. The portal writes these variables as an inline style on that element, and only an important declaration in a stylesheet wins over an inline one.

```js
var CSS = [
  '#app { --brand-primary: #1B5E20 !important; --brand-accent: #A5D6A7 !important; }'
];
```

Several variables can go in one rule, as above, or one per line. Note the required ; 

## Colours

| Variable | Example | Used for |
|---|---|---|
| `--brand-primary` | `#66298E` | The main brand colour: buttons, focus rings, selected choices, and the light tint behind icons |
| `--brand-accent` | `#FFD5FF` | Accent colour |
| `--brand-text` | `#292333` | Default text |
| `--brand-muted` | `#716779` | Secondary text |
| `--brand-background` | `#F5F1F9` | Page background |
| `--brand-surface` | `#FFFFFF` | Cards and panels |
| `--brand-canvas` | `#FFFFFF` | Content canvas |
| `--brand-border` | `#E4D0F1` | Borders and dividers |
| `--brand-surface-radius` | `16px` | Corner rounding of cards and panels |
| `--brand-surfaceText` | `#292333` | Text on a surface |
| `--brand-surfaceMuted` | `#716779` | Secondary text on a surface |
| `--brand-surfaceAnswer` | `#292333` | Answer text on a surface |
| `--brand-surfaceFieldAnswer` | `#292333` | Text typed into a field |
| `--brand-surfaceFieldPlaceholder` | `#716779` | Placeholder text in a field |
| `--brand-disabled-opacity` | `0.6` | Opacity of disabled controls |

## Type

| Variable | Example | Used for |
|---|---|---|
| `--primary-font` | `Inter` | Default font family |
| `--brand-h1-family` | `"Plus Jakarta Sans"` | Page titles |
| `--brand-h1-size` | `24px` | |
| `--brand-h1-weight` | `700` | |
| `--brand-h1-color` | `#292333` | |
| `--brand-h2-family` | `"Plus Jakarta Sans"` | Section headings |
| `--brand-h2-size` | `18px` | |
| `--brand-h2-weight` | `700` | |
| `--brand-h2-color` | `#292333` | |
| `--brand-h3-family` | `"Plus Jakarta Sans"` | Card and group headings |
| `--brand-h3-size` | `16px` | |
| `--brand-h3-weight` | `600` | |
| `--brand-h3-color` | `#292333` | |
| `--brand-body-family` | `"Inter"` | Body text |
| `--brand-body-size` | `12px` | |
| `--brand-body-weight` | `400` | |
| `--brand-body-color` | `#292333` | |
| `--brand-label-family` | `"Inter"` | Field labels |
| `--brand-label-size` | `12px` | |
| `--brand-label-weight` | `500` | |
| `--brand-label-lineHeight` | `1.5` | |
| `--brand-label-letterSpacing` | `0px` | |
| `--brand-label-color` | `#292333` | |
| `--brand-help-family` | `"Inter"` | Help text under fields |
| `--brand-help-size` | `10px` | |
| `--brand-help-weight` | `400` | |
| `--brand-help-lineHeight` | `1.5` | |
| `--brand-help-letterSpacing` | `0px` | |
| `--brand-help-color` | `#716779` | |
| `--brand-answer-family` | `"Inter"` | Answer text |
| `--brand-answer-size` | `12px` | |
| `--brand-answer-weight` | `400` | |
| `--brand-answer-lineHeight` | `1.5` | |
| `--brand-answer-letterSpacing` | `0px` | |
| `--brand-answer-color` | `#292333` | |

Font families need their quotes, as in `'"Plus Jakarta Sans"'` inside a single-quoted CSS line, and the font has to be one the portal already loads or one the viewer has installed.

## Buttons

| Variable | Example | Used for |
|---|---|---|
| `--brand-button-variant` | `solid` | Primary button style |
| `--brand-button-secondaryVariant` | `outline` | Secondary button style |
| `--brand-button-radius` | `12px` | Corner rounding; the bundled cards use it for their header arrow button |
| `--brand-button-borderWidth` | `1px` | |
| `--brand-button-paddingX` | `20px` | |
| `--brand-button-paddingY` | `14px` | |
| `--brand-button-width` | `content` | |
| `--brand-button-alignment` | `left` | |
| `--brand-button-fill` | `#66298E` | Primary button background |
| `--brand-button-text` | `#FFFFFF` | Primary button text |
| `--brand-button-solidText` | `#FFFFFF` | |
| `--brand-button-border` | `#66298E` | |
| `--brand-button-secondaryFill` | `#66298E` | |
| `--brand-button-secondaryBackground` | `transparent` | |
| `--brand-button-secondaryBorder` | `#66298E` | |
| `--brand-button-secondaryText` | `#66298E` | |
| `--brand-button-family` | `"Inter"` | Button text font |
| `--brand-button-size` | `12px` | |
| `--brand-button-weight` | `500` | |
| `--brand-button-lineHeight` | `1.5` | |
| `--brand-button-letterSpacing` | `0px` | |
| `--brand-button-color` | `#FFFFFF` | |

## Form fields

These mostly affect forms shown inside the portal, such as request forms.

| Variable | Example | Used for |
|---|---|---|
| `--brand-field-variant` | `outlined` | Field style |
| `--brand-field-radius` | `12px` | |
| `--brand-field-borderWidth` | `1px` | |
| `--brand-field-paddingX` | `12px` | |
| `--brand-field-paddingY` | `14px` | |
| `--brand-field-fill` | `#FFFFFFff` | Field background |
| `--brand-field-fillOpacity` | `100px` | |
| `--brand-field-border` | `#E4D0F1` | |
| `--brand-field-placeholder` | `#716779` | |
| `--brand-field-shadow` | `none` | |
| `--brand-field-textareaHeight` | `112px` | |

## Choices (radio buttons and checkboxes)

| Variable | Example | Used for |
|---|---|---|
| `--brand-choice-presentation` | `cards` | How choices are drawn |
| `--brand-choice-layout` | `vertical` | |
| `--brand-choice-markerSize` | `18px` | The circle or box |
| `--brand-choice-markerGap` | `10px` | |
| `--brand-choice-paddingX` | `14px` | |
| `--brand-choice-paddingY` | `16px` | |
| `--brand-choice-radius` | `12px` | |
| `--brand-choice-borderWidth` | `1px` | |
| `--brand-choice-fill` | `#FFFFFF` | |
| `--brand-choice-border` | `#E4D0F1` | |
| `--brand-choice-text` | `#292333` | |
| `--brand-choice-selectedFill` | `#E4D0F1` | Selected choice background |
| `--brand-choice-selectedBorder` | `#66298E` | |
| `--brand-choice-selectedText` | `#FFFFFF` | |
| `--brand-choice-selectedLabelText` | `#292333` | |

## Spacing

| Variable | Example | Used for |
|---|---|---|
| `--brand-space-questionGap` | `20px` | Between form questions |
| `--brand-space-labelGap` | `7px` | Between a label and its field |
| `--brand-space-helpGap` | `6px` | Between a field and its help text |
| `--brand-space-choiceRowGap` | `12px` | |
| `--brand-space-choiceColumnGap` | `16px` | |
| `--brand-space-sectionGap` | `28px` | Between sections |
| `--brand-space-containerPadding` | `32px` | Inside the main container |

## States

| Variable | Example | Used for |
|---|---|---|
| `--brand-state-focusBorder` | `#66298E` | Focused field border |
| `--brand-state-focusRing` | `#66298E` | Focus ring colour |
| `--brand-state-focusRingWidth` | `3px` | |
| `--brand-state-focusRingShadow` | `#66298E4D` | |
| `--brand-state-errorText` | `#B42318` | Validation message |
| `--brand-state-errorBorder` | `#B42318` | |
| `--brand-state-hoverBackground` | `#7B479E` | Hovered button |
| `--brand-state-hoverText` | `#FFFFFF` | |
| `--brand-state-disabledBackground` | `#F5F1F9` | |
| `--brand-state-disabledText` | `#716779` | |
| `--brand-state-disabledOpacity` | `60px` | |

## Tables

| Variable | Example | Used for |
|---|---|---|
| `--portal-table-row-background` | `#FFFFFF` | Table rows |
| `--portal-table-row-text` | `#292333` | |
| `--portal-table-row-muted` | `#716779` | |

## Greys worked out from the brand colours

These are defined in terms of the variables above, so change those instead. Overriding a grey directly only makes sense for a targeted effect.

| Variable | Defined as |
|---|---|
| `--v-gray_10-base` | `var(--brand-background)` |
| `--v-gray_20-base` | 5% brand primary mixed into the surface colour; the bundled cards use it for count badges and hover |
| `--v-gray_30-base` | 35% border colour mixed into the surface colour |
| `--v-gray_50-base` | `var(--brand-border)` |
| `--v-gray_60-base` | `var(--brand-surfaceMuted)` |
| `--v-gray_70-base` | `var(--brand-surfaceMuted)` |
| `--v-gray_80-base` | `var(--brand-surfaceText)` |
| `--v-gray_90-base` | `var(--brand-surfaceText)` |

## Variables the bundled snippets use

These are not in the inline brand list; they come from the portal's stylesheets and are expected to follow the brand variables. The parent script's cards are built on them, so changing one restyles the cards along with the portal. The same `#app` rule works for them.

| Variable | Used for |
|---|---|
| `--v-sidebar-base` | Left menu and brand area background; follows the brand primary colour |
| `--v-primary-base` | Card icon colour, footer links and the header arrow |
| `--v-accent-base` | Fallback colour for a ticket status dot |
| `--v-blue_5-base` | Tint behind the card icon |
| `--portal-border` | Card borders and row dividers |
| `--portal-surface` | Card background |
| `--portal-text` | Card titles |
| `--portal-muted` | Counts, empty text and the arrow button |
| `--portal-nav-muted` | Un-highlighted menu item text |
| `--portal-radius-md` | Card corner rounding |
