/**
 * The "Option 1" / "Option 2" blocks added to a two-quote email when the
 * company's saved template has no options section of its own. The layout
 * matches the default New quote and Revised quote templates.
 *
 * Shared by the send dialog and the template editor preview, so the
 * preview always shows what a two-quote send really looks like.
 */
export function buildOptionBlock(opt: {
  quoteNumber: string;
  amount: string;
  quoteUrl: string | null;
  guestCount: number | null;
  eventDateLabel: string | null;
  eventName: string | null;
  label: string;
}): string[] {
  const details: string[] = [];
  if (opt.guestCount && opt.guestCount > 0)
    details.push(`${opt.guestCount} guest${opt.guestCount === 1 ? "" : "s"}`);
  if (opt.eventDateLabel) details.push(opt.eventDateLabel);

  const heading = opt.eventName
    ? `${opt.label} — ${opt.quoteNumber} (${opt.eventName})`
    : `${opt.label} — ${opt.quoteNumber}`;

  const block: string[] = [heading];
  if (details.length > 0) block.push(details.join(" — "));
  if (opt.amount) block.push(`Total: ${opt.amount}`);
  if (opt.quoteUrl) {
    block.push(`View and accept this quote: ${opt.quoteUrl}`);
  } else {
    block.push("Please see the attached PDF for this option.");
  }
  return block;
}

export function appendOptionBeforeSignoff(body: string, optionLines: string[]): string {
  const isHtml = /<\/?[a-z][^>]*>/i.test(body);
  const escapedText = optionLines.join("\n")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const optionBlock = isHtml
    ? `<p>${escapedText.replace(/\n/g, "<br>")}</p>`
    : optionLines.join("\n");
  if (isHtml) {
    const signoff = /<(?:p|div)[^>]*>\s*(?:kind regards|best regards|regards|thanks|best)(?:\s*[,!]|\s*<br\s*\/?\s*>|\s*<\/(?:p|div)>)/i.exec(body);
    if (signoff) {
      return `${body.slice(0, signoff.index)}${optionBlock}${body.slice(signoff.index)}`;
    }
    return `${body}${optionBlock}`;
  }

  const signoff = /(?:^|\r?\n)[ \t]*(?:kind regards|best regards|regards|thanks|best)[,!]?[ \t]*(?=\r?\n|$)/i.exec(body);
  if (!signoff) return `${body.trimEnd()}\n\n${optionBlock}`;
  const lineStart = signoff.index + (signoff[0].startsWith("\n") ? 1 : 0);
  return `${body.slice(0, lineStart).trimEnd()}\n\n${optionBlock}\n\n${body.slice(lineStart).trimStart()}`;
}
