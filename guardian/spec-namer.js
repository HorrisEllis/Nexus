'use strict';
// spec-namer.js — stub
// Infers filenames from spec content + lang context
// UUID: guardian-spec-namer-stub-v1
function inferFilename(content, lang, jobId) {
  if (!content) return null;
  const extMap = { typescript:'ts', javascript:'js', python:'py', rust:'rs', css:'css',
    html:'html', json:'json', bash:'sh', shell:'sh', sql:'sql', markdown:'md' };
  const ext = extMap[lang] || lang || 'txt';
  const firstLine = content.split('\n')[0].trim();
  const nameMatch = firstLine.match(/(?:\/\/|#|--|<!--)\s*@?file[:\s]+([^\s]+)/i);
  if (nameMatch) return nameMatch[1].endsWith('.' + ext) ? nameMatch[1] : nameMatch[1] + '.' + ext;
  return (jobId ? jobId.slice(0,8) : 'output') + '.' + ext;
}
function inferSpecFilename(content, jobId) {
  if (!content) return null;
  const nameMatch = content.match(/name:\s*([^\n]+)/i);
  if (nameMatch) return nameMatch[1].trim().replace(/\s+/g, '-').toLowerCase() + '.spec';
  return (jobId ? jobId.slice(0,8) : 'spec') + '.spec';
}
module.exports = { inferFilename, inferSpecFilename };
