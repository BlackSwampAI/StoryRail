import { Fragment, type ReactNode } from "react";

import styles from "./newsroom-shell.module.css";

function safeLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function inlineMarkdown(value: string): ReactNode {
  const tokens = value.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
  return tokens.map((token, index) => {
    if (token.startsWith("`") && token.endsWith("`"))
      return <code key={index}>{token.slice(1, -1)}</code>;
    if (token.startsWith("**") && token.endsWith("**"))
      return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("*") && token.endsWith("*"))
      return <em key={index}>{token.slice(1, -1)}</em>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
    if (link) {
      const href = safeLink(link[2] ?? "");
      if (href !== null)
        return (
          <a key={index} href={href} target="_blank" rel="noopener noreferrer">
            {link[1]}
          </a>
        );
    }
    return <Fragment key={index}>{token}</Fragment>;
  });
}

export function SafeMarkdown({ markdown }: Readonly<{ markdown: string }>) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith("```")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre key={`code-${index}`}>
          <code data-language={language || undefined}>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const content = inlineMarkdown(heading[2] ?? "");
      const level = heading[1]?.length ?? 2;
      if (level === 1) blocks.push(<h2 key={`heading-${index}`}>{content}</h2>);
      else if (level === 2) blocks.push(<h3 key={`heading-${index}`}>{content}</h3>);
      else blocks.push(<h4 key={`heading-${index}`}>{content}</h4>);
      index += 1;
      continue;
    }

    if (/^\s*[-*_]{3,}\s*$/.test(line)) {
      blocks.push(<hr key={`rule-${index}`} />);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(
        <blockquote key={`quote-${index}`}>{inlineMarkdown(quote.join(" "))}</blockquote>,
      );
      continue;
    }

    const unordered = /^\s*[-*+]\s+/.test(line);
    const ordered = /^\s*\d+[.)]\s+/.test(line);
    if (unordered || ordered) {
      const entries: string[] = [];
      const pattern = unordered ? /^\s*[-*+]\s+/ : /^\s*\d+[.)]\s+/;
      while (index < lines.length && pattern.test(lines[index] ?? "")) {
        entries.push((lines[index] ?? "").replace(pattern, ""));
        index += 1;
      }
      const children = entries.map((entry, entryIndex) => (
        <li key={entryIndex}>{inlineMarkdown(entry)}</li>
      ));
      blocks.push(
        ordered ? (
          <ol key={`list-${index}`}>{children}</ol>
        ) : (
          <ul key={`list-${index}`}>{children}</ul>
        ),
      );
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      (lines[index] ?? "").trim().length > 0 &&
      !/^(#{1,6})\s+|^```|^>\s?|^\s*[-*+]\s+|^\s*\d+[.)]\s+|^\s*[-*_]{3,}\s*$/.test(
        lines[index] ?? "",
      )
    ) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{inlineMarkdown(paragraph.join(" "))}</p>);
  }

  return <div className={styles.articleBody}>{blocks}</div>;
}
