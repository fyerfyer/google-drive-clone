import { useCallback, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { xml } from "@codemirror/lang-xml";
import { languages } from "@codemirror/language-data";
import { getFileExtension } from "@/lib/file-preview";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

interface TextEditorProps {
  value: string;
  onChange: (value: string) => void;
  fileName: string;
  readOnly?: boolean;
  height?: string;
  className?: string;
}

/**
 * Custom Markdown styling for CodeMirror — enhances headings, bold, italic,
 * code spans, and code blocks with visual distinction.
 */
const markdownStyles = EditorView.theme({
  // Headings
  ".cm-header-1": {
    fontSize: "1.6em",
    fontWeight: "700",
    lineHeight: "1.4",
  },
  ".cm-header-2": {
    fontSize: "1.35em",
    fontWeight: "700",
    lineHeight: "1.4",
  },
  ".cm-header-3": {
    fontSize: "1.15em",
    fontWeight: "600",
    lineHeight: "1.4",
  },
  ".cm-header-4": {
    fontSize: "1.05em",
    fontWeight: "600",
    lineHeight: "1.4",
  },
  ".cm-header-5, .cm-header-6": {
    fontSize: "1em",
    fontWeight: "600",
    lineHeight: "1.4",
  },
  // Inline code
  ".ͼ1f": {
    fontFamily: "var(--font-mono, monospace)",
    backgroundColor: "rgba(135,131,120,0.15)",
    borderRadius: "3px",
    padding: "0.1em 0.3em",
    fontSize: "0.92em",
  },
  // Fenced code block lines
  ".cm-line.cm-codeblock": {
    fontFamily: "var(--font-mono, monospace)",
    backgroundColor: "rgba(135,131,120,0.08)",
    fontSize: "0.92em",
  },
  // Emphasis / strong
  ".cm-strong": { fontWeight: "700" },
  ".cm-em": { fontStyle: "italic" },
  // Blockquote
  ".cm-quote": {
    color: "var(--muted-foreground, #6b7280)",
    borderLeft: "3px solid var(--border, #d1d5db)",
    paddingLeft: "0.8em",
  },
  // Links
  ".cm-url, .cm-link": {
    color: "var(--primary, #3b82f6)",
    textDecoration: "underline",
  },
  // Horizontal rule
  ".cm-hr": {
    borderTop: "1px solid var(--border, #d1d5db)",
    display: "block",
    marginBlock: "0.5em",
  },
});

/**
 * CodeMirror-based text editor with language-aware syntax highlighting.
 * Supports markdown, code files, and plain text.
 * Reserved: `onAIAssist` callback for future AI agent integration.
 */
export const TextEditor = ({
  value,
  onChange,
  fileName,
  readOnly = false,
  height = "100%",
  className,
}: TextEditorProps) => {
  const handleChange = useCallback(
    (val: string) => {
      onChange(val);
    },
    [onChange],
  );

  const extensions = useMemo((): Extension[] => {
    const ext = getFileExtension(fileName);
    // Always enable line wrapping for all file types
    const base: Extension[] = [EditorView.lineWrapping];

    switch (ext) {
      case "md":
      case "markdown":
        return [
          ...base,
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          markdownStyles,
        ];
      case "js":
      case "jsx":
        return [...base, javascript({ jsx: true })];
      case "ts":
      case "tsx":
        return [...base, javascript({ jsx: true, typescript: true })];
      case "json":
        return [...base, json()];
      case "html":
      case "htm":
        return [...base, html()];
      case "css":
        return [...base, css()];
      case "xml":
      case "svg":
        return [...base, xml()];
      default:
        return base;
    }
  }, [fileName]);

  return (
    <div className={className} style={{ height }}>
      <CodeMirror
        value={value}
        height={height}
        extensions={extensions}
        onChange={handleChange}
        readOnly={readOnly}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightSpecialChars: true,
          foldGutter: true,
          dropCursor: true,
          allowMultipleSelections: false,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: true,
          crosshairCursor: false,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          searchKeymap: true,
          foldKeymap: true,
          completionKeymap: true,
          lintKeymap: true,
        }}
        style={{ height: "100%", fontSize: "14px" }}
      />
    </div>
  );
};

// ============================================================
// AI Agent Integration Interface (Reserved for future use)
// ============================================================

/**
 * Interface for future AI agent integration with the text editor.
 * When an AI agent is connected, it can:
 * - Suggest edits to the current document
 * - Insert text at cursor position
 * - Replace selected text
 * - Provide auto-completions
 */
export interface AIAgentEditorAPI {
  /** Get current document content */
  getContent: () => string;
  /** Replace entire document content */
  setContent: (content: string) => void;
  /** Insert text at a specific position */
  insertAt: (position: number, text: string) => void;
  /** Replace a range of text */
  replaceRange: (from: number, to: number, text: string) => void;
  /** Get current cursor position */
  getCursorPosition: () => number;
  /** Get currently selected text */
  getSelection: () => string;
  /** Set the cursor position */
  setCursorPosition: (position: number) => void;
}
