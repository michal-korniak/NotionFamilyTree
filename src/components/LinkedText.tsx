const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

// Sentence punctuation right after a link, and a closing parenthesis that has no opening one inside it, belong to the text around it.
function trimTrailing(url: string): string {
  let end = url.length;
  while (end > 0) {
    const last = url.charAt(end - 1);
    if ('.,;:!?\'"'.includes(last)) end--;
    else if (last === ')' && (url.slice(0, end).match(/\(/g)?.length ?? 0) < (url.slice(0, end).match(/\)/g)?.length ?? 0)) end--;
    else break;
  }
  return url.slice(0, end);
}

export function LinkedText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimTrailing(match[0]);
    if (!url) continue;
    parts.push(text.slice(from, match.index));
    parts.push(<a key={match.index} href={url.startsWith('www.') ? `https://${url}` : url} target="_blank" rel="noopener noreferrer" className="break-all text-sky-700 underline underline-offset-2 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300">{url}</a>);
    from = match.index + url.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}
