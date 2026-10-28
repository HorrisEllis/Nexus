'use strict';
/**
 * engines/ui/lib/markdown.js — enough markdown to render README.md in-panel.
 * Deliberately small: the platform ships no third-party dependencies, and the
 * only document it renders is its own README.
 */

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderMarkdown(md) {
  const blocks = [];
  // Pull fenced code out first so its contents are never touched by inline rules.
  md = String(md).replace(/```[\s\S]*?```/g, m => {
    blocks.push('<pre>' + esc(m.replace(/```\w*\n?/g, '').replace(/```$/, '')) + '</pre>');
    return `\u0000${blocks.length - 1}\u0000`;
  });

  let out = esc(md)
    .replace(/^#### (.*)$/gm, '<h4 style="margin:16px 0 6px">$1</h4>')
    .replace(/^### (.*)$/gm,  '<h3 style="margin:18px 0 8px">$1</h3>')
    .replace(/^## (.*)$/gm,   '<h2 style="margin:22px 0 10px;font-size:17px">$1</h2>')
    .replace(/^# (.*)$/gm,    '<h1 style="margin:0 0 14px;font-size:20px">$1</h1>')
    .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid var(--edge);margin:20px 0">')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/^[-*] (.*)$/gm, '<li>$1</li>')
    .replace(/(<li>(?:[\s\S](?!<\/ul>))*?<\/li>)(?!\s*<li>)/g, '<ul style="margin:8px 0 8px 20px">$1</ul>')
    .replace(/\n{2,}/g, '</p><p style="margin:10px 0">');

  out = '<p style="margin:10px 0">' + out + '</p>';
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[Number(i)]);
}

module.exports = { renderMarkdown, esc };
