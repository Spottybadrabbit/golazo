"use client";

import { useState } from "react";

interface CodeBlockProps {
  code: string;
  lang?: string;
  filename?: string;
}

/** Styled code block with a copy button, in the docs' volt/mono treatment. */
export default function CodeBlock({ code, lang = "text", filename }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — button just won't confirm */
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-raised/60">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <span className="font-mono text-xs text-muted">{filename ?? lang}</span>
        <button
          onClick={copy}
          className="rounded-md px-2 py-1 font-mono text-xs text-muted transition-colors hover:bg-surface hover:text-volt"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-xs leading-relaxed sm:text-[13px]">
        <code className="font-mono text-chalk">{code}</code>
      </pre>
    </div>
  );
}
