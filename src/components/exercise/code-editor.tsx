"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import * as React from "react";
import { Skeleton } from "@/components/ui/states";

/*
 * The editor, behind a dynamic boundary.
 *
 * CodeMirror is a DOM library and about 300KB of it — neither of which belongs
 * in the server render or in the bundle of a page that is not an exercise. So
 * every codemirror import lives inside this one dynamic() call, loaded only
 * once someone actually opens a problem.
 */

type EditorProps = {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  /** CSS height for the scroll area. */
  height?: string;
  dark: boolean;
};

const Editor = dynamic<EditorProps>(
  async () => {
    const [{ default: CodeMirror }, { python }] = await Promise.all([
      import("@uiw/react-codemirror"),
      import("@codemirror/lang-python"),
    ]);
    const extensions = [python()];

    return function LoadedEditor({
      value,
      onChange,
      readOnly,
      height = "420px",
      dark,
    }: EditorProps) {
      return (
        <CodeMirror
          value={value}
          onChange={onChange}
          extensions={extensions}
          theme={dark ? "dark" : "light"}
          height={height}
          readOnly={readOnly}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: !readOnly,
            autocompletion: false,
          }}
          className="text-[13px]"
        />
      );
    };
  },
  {
    ssr: false,
    loading: () => (
      <div className="space-y-2 p-3">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton
            key={index}
            className="h-3"
            style={{ width: `${[60, 80, 45, 70, 35, 65, 50, 30][index]}%` }}
          />
        ))}
      </div>
    ),
  },
);

export function CodeEditor(props: Omit<EditorProps, "dark">) {
  const { resolvedTheme } = useTheme();
  // next-themes resolves only after hydration. The app defaults to dark, so
  // assuming dark avoids a light-themed editor flashing on every load.
  const dark = resolvedTheme !== "light";

  return (
    <div className="border-line overflow-hidden rounded-xl border font-mono">
      <Editor {...props} dark={dark} />
    </div>
  );
}
