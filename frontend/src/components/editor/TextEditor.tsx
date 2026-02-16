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

interface TextEditorProps {
  value: string;
  onChange: (value: string) => void;
  fileName: string;
  readOnly?: boolean;
  height?: string;
  className?: string;
}

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
    switch (ext) {
      case "md":
      case "markdown":
        return [markdown({ base: markdownLanguage, codeLanguages: languages })];
      case "js":
      case "jsx":
        return [javascript({ jsx: true })];
      case "ts":
      case "tsx":
        return [javascript({ jsx: true, typescript: true })];
      case "json":
        return [json()];
      case "html":
      case "htm":
        return [html()];
      case "css":
        return [css()];
      case "xml":
      case "svg":
        return [xml()];
      default:
        return [];
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
