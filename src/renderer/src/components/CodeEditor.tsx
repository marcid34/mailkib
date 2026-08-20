import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { css as cssLang } from '@codemirror/lang-css'
import { html as htmlLang } from '@codemirror/lang-html'
import { javascript as jsLang } from '@codemirror/lang-javascript'
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting
} from '@codemirror/language'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder,
  rectangularSelection
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { useEffect, useRef, type JSX } from 'react'
import type { ThemeColors } from '../lib/themes'
import { useTheme } from '../lib/settings-context'

export type CodeLanguage = 'html' | 'css' | 'javascript'

/**
 * Colours come from whichever of the app's themes is active rather than from a
 * fixed palette, so the editor is never the one panel wearing someone else's
 * scheme. Tokyo Night's own token roles are the model: keywords purple, strings
 * green, comments faint, tags red, attributes yellow.
 */
function highlightFor(c: ThemeColors): HighlightStyle {
  return HighlightStyle.define([
    { tag: [t.comment, t.lineComment, t.blockComment], color: c.fgFaint, fontStyle: 'italic' },
    { tag: [t.keyword, t.modifier, t.controlKeyword, t.moduleKeyword], color: c.purple },
    { tag: [t.string, t.special(t.string), t.regexp], color: c.green },
    { tag: [t.number, t.bool, t.null, t.atom], color: c.orange },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.blue },
    { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: c.fg },
    { tag: [t.variableName, t.self], color: c.fgDim },
    { tag: [t.propertyName], color: c.blue },
    { tag: [t.typeName, t.className, t.namespace], color: c.teal },
    { tag: [t.tagName], color: c.red },
    { tag: [t.attributeName], color: c.yellow },
    { tag: [t.attributeValue], color: c.green },
    { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: c.fgMute },
    { tag: [t.angleBracket, t.squareBracket, t.paren, t.brace], color: c.fgMute },
    { tag: [t.link, t.url], color: c.cyan, textDecoration: 'underline' },
    { tag: [t.heading], color: c.blue, fontWeight: '600' },
    { tag: [t.emphasis], fontStyle: 'italic' },
    { tag: [t.strong], fontWeight: '600' },
    { tag: [t.invalid], color: c.red }
  ])
}

function themeFor(c: ThemeColors): Extension {
  return EditorView.theme(
    {
      '&': {
        color: c.fg,
        backgroundColor: 'transparent',
        height: '100%',
        fontSize: '12.75px'
      },
      '.cm-content': {
        fontFamily: 'var(--mono)',
        padding: '10px 0 40px',
        caretColor: c.accent,
        lineHeight: '1.6'
      },
      '.cm-scroller': { fontFamily: 'var(--mono)', overflow: 'auto' },
      '&.cm-focused': { outline: 'none' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: c.accent, borderLeftWidth: '2px' },
      '.cm-selectionBackground, ::selection': { backgroundColor: `${c.blue}33` },
      '&.cm-focused .cm-selectionBackground': { backgroundColor: `${c.blue}44` },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: c.fgFaint,
        border: 'none',
        borderRight: `1px solid ${c.borderSoft}`,
        paddingRight: '4px',
        fontFamily: 'var(--mono)'
      },
      '.cm-activeLineGutter': { backgroundColor: 'transparent', color: c.fgMute },
      '.cm-activeLine': { backgroundColor: `${c.bgHover}66` },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: `${c.accent}2e`,
        outline: `1px solid ${c.borderStrong}`
      },
      '.cm-nonmatchingBracket': { color: c.red },
      // The completion popup is the one piece of chrome CodeMirror draws that
      // has to match the app's own menus rather than its defaults.
      '.cm-tooltip': {
        backgroundColor: c.bgDeep,
        border: `1px solid ${c.borderStrong}`,
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(0,0,0,0.35)'
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul': {
        fontFamily: 'var(--mono)',
        fontSize: '12px',
        maxHeight: '16em'
      },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px', color: c.fgDim },
      '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: c.bgActive,
        color: c.fg
      },
      '.cm-completionLabel': { color: 'inherit' },
      '.cm-completionMatchedText': { color: c.accent, textDecoration: 'none', fontWeight: '600' },
      '.cm-completionDetail': { color: c.fgFaint, fontStyle: 'normal', marginLeft: '10px' },
      '.cm-completionIcon': { color: c.fgFaint, paddingRight: '6px' },
      '.cm-panels': { backgroundColor: c.bgDeep, color: c.fg },
      '.cm-placeholder': { color: c.fgFaint }
    },
    { dark: true }
  )
}

/**
 * What a note or an HTML mail body actually reaches for. The language packages
 * already complete tags, attributes and CSS properties; this fills in the parts
 * they cannot know -- the globals a small inline script tends to use.
 */
const JS_GLOBALS = [
  ['document', 'variable'], ['window', 'variable'], ['console', 'variable'],
  ['querySelector', 'method'], ['querySelectorAll', 'method'], ['getElementById', 'method'],
  ['addEventListener', 'method'], ['removeEventListener', 'method'], ['createElement', 'method'],
  ['appendChild', 'method'], ['textContent', 'property'], ['innerHTML', 'property'],
  ['classList', 'property'], ['setAttribute', 'method'], ['getAttribute', 'method'],
  ['style', 'property'], ['dataset', 'property'], ['value', 'property'],
  ['setTimeout', 'function'], ['setInterval', 'function'], ['clearTimeout', 'function'],
  ['requestAnimationFrame', 'function'], ['JSON', 'variable'], ['Math', 'variable'],
  ['Object', 'class'], ['Array', 'class'], ['String', 'class'], ['Number', 'class'],
  ['Promise', 'class'], ['Date', 'class'], ['Map', 'class'], ['Set', 'class'],
  ['localStorage', 'variable'], ['const', 'keyword'], ['let', 'keyword'],
  ['function', 'keyword'], ['return', 'keyword'], ['async', 'keyword'], ['await', 'keyword']
] as const

function jsGlobalCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w$]+/)
  if (!word || (word.from === word.to && !context.explicit)) return null
  return {
    from: word.from,
    options: JS_GLOBALS.map(([label, type]) => ({ label, type })),
    validFor: /^[\w$]*$/
  }
}

function languageExtension(language: CodeLanguage): Extension {
  if (language === 'css') return cssLang()
  if (language === 'javascript') return [jsLang(), autocompletion({ override: undefined })]
  // matchClosingTags and autoCloseTags are what make typing `<div>` produce the
  // closing tag, and embedded <style>/<script> get CSS and JS parsing for free.
  return htmlLang({ autoCloseTags: true, matchClosingTags: true, selfClosingTags: false })
}

const languageConf = new Compartment()
const themeConf = new Compartment()

function baseExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    history(),
    drawSelection(),
    rectangularSelection(),
    indentOnInput(),
    indentUnit.of('  '),
    bracketMatching(),
    closeBrackets(),
    autocompletion({
      activateOnTyping: true,
      closeOnBlur: true,
      icons: true,
      override: undefined
    }),
    EditorState.allowMultipleSelections.of(true),
    EditorView.lineWrapping,
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...completionKeymap,
      // Tab indents instead of walking the focus ring, which is what anyone
      // typing code expects; shift+tab dedents, and a selection shifts wholesale.
      indentWithTab
    ])
  ]
}

export function CodeEditor({
  value,
  language,
  placeholder,
  onChange,
  onBlur,
  autoFocus
}: {
  value: string
  language: CodeLanguage
  placeholder?: string
  onChange: (next: string) => void
  onBlur?: () => void
  autoFocus?: boolean
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const { theme } = useTheme()

  // Callbacks live in refs so the editor is built exactly once: rebuilding it
  // on every render would throw away the cursor, the selection and the undo
  // history on each keystroke.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onBlurRef = useRef(onBlur)
  onBlurRef.current = onBlur

  useEffect(() => {
    if (!host.current) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        ...baseExtensions(),
        languageConf.of(languageExtension(language)),
        themeConf.of([themeFor(theme.colors), syntaxHighlighting(highlightFor(theme.colors))]),
        placeholder ? cmPlaceholder(placeholder) : [],
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          if (update.focusChanged && !update.view.hasFocus) onBlurRef.current?.()
        })
      ]
    })
    const instance = new EditorView({ state, parent: host.current })
    view.current = instance
    if (autoFocus) instance.focus()
    return () => {
      instance.destroy()
      view.current = null
    }
    // Built once per mount; language and theme are swapped through compartments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    view.current?.dispatch({
      effects: languageConf.reconfigure(languageExtension(language))
    })
  }, [language])

  useEffect(() => {
    view.current?.dispatch({
      effects: themeConf.reconfigure([
        themeFor(theme.colors),
        syntaxHighlighting(highlightFor(theme.colors))
      ])
    })
  }, [theme])

  // Adopt a document replaced from outside -- switching notes, say -- without
  // disturbing anything while the value is simply what the user just typed.
  useEffect(() => {
    const instance = view.current
    if (!instance) return
    const current = instance.state.doc.toString()
    if (current === value) return
    instance.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      selection: { anchor: Math.min(instance.state.selection.main.anchor, value.length) }
    })
  }, [value])

  return <div className="codeeditor" ref={host} />
}

/** Focus helper for callers that used to reach for a textarea ref. */
export function focusCodeEditor(container: HTMLElement | null): void {
  ;(container?.querySelector('.cm-content') as HTMLElement | null)?.focus()
}
