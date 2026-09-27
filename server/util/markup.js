const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

export function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80) || 'post';
}

export function renderPostBody(source) {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let list = null;
  let paragraph = [];

  const closeParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      closeParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^(#{2,3})\s+(.*)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length === 2 ? 'h2' : 'h3';
      out.push(`<${level}>${inline(heading[2])}</${level}>`);
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      closeParagraph();
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      closeParagraph();
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      closeParagraph();
      closeList();
      out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
      continue;
    }

    paragraph.push(line);
  }

  closeParagraph();
  closeList();
  return out.join('\n');
}

function inline(text) {
  let html = esc(text);

  html = html.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

  html = html.replace(
    /\[([^\]]{1,120})\]\((https:\/\/[^\s)]{1,300})\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  return html;
}

export function autoSummary(body, max = 180) {
  const line = String(body || '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('#') && !l.startsWith('-') && !l.startsWith('>'));
  if (!line) return '';
  const plain = line.replace(/[*`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  return plain.length > max ? plain.slice(0, max - 1).trimEnd() + '…' : plain;
}
