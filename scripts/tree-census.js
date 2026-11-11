'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Measures the project tree: size per system and per folder, file counts,
 * largest files, generated files, unrequired files, and inline-quote count per file.
 * Written as a dated report.
 * 
 * @param {string[]} [rootDirs=['.']] - Directories to scan.
 * @param {Object} [options={}] - Options including rootDir.
 * @returns {Object} Census metrics report.
 */
function measureTree(rootDirs = ['.'], options = {}) {
  if (!Array.isArray(rootDirs)) {
    throw new Error(`measureTree: expected rootDirs to be an array of strings, received ${typeof rootDirs}`);
  }

  const rootDir = options.rootDir || process.cwd();
  if (typeof rootDir !== 'string') {
    throw new Error(`measureTree: expected rootDir to be a string, received ${typeof rootDir}`);
  }

  const excludeDirs = new Set(['node_modules', '.git', '.nexus', 'coverage', 'dist']);
  
  const filesData = [];
  const folderStats = {};
  const systemStats = {};
  
  function walk(currentDir, relativePath = '') {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      throw new Error(`measureTree: failed to read directory '${currentDir}': ${err.message}`);
    }

    for (const entry of entries) {
      const name = entry.name;
      if (excludeDirs.has(name)) continue;
      
      const fullPath = path.join(currentDir, name);
      const relPath = path.join(relativePath, name).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.isFile()) {
        let stats;
        try {
          stats = fs.statSync(fullPath);
        } catch (err) {
          throw new Error(`measureTree: failed to stat file '${fullPath}': ${err.message}`);
        }

        const size = stats.size;
        const topFolder = relPath.split('/')[0] || '.';
        const system = inferSystem(relPath);

        let content = '';
        try {
          content = fs.readFileSync(fullPath, 'utf8');
        } catch (err) {
          content = '';
        }

        const quoteCount = countInlineQuotes(content);
        const isGenerated = checkIsGenerated(name, content);

        const fileRecord = {
          path: relPath,
          fullPath,
          size,
          topFolder,
          system,
          quoteCount,
          isGenerated,
          content
        };

        filesData.push(fileRecord);

        if (!folderStats[topFolder]) {
          folderStats[topFolder] = { count: 0, size: 0 };
        }
        folderStats[topFolder].count += 1;
        folderStats[topFolder].size += size;

        if (!systemStats[system]) {
          systemStats[system] = { count: 0, size: 0 };
        }
        systemStats[system].count += 1;
        systemStats[system].size += size;
      }
    }
  }

  for (const dir of rootDirs) {
    const absDir = path.resolve(rootDir, dir);
    if (fs.existsSync(absDir)) {
      walk(absDir, dir === '.' ? '' : dir);
    }
  }

  const referencedFiles = new Set();
  for (const f of filesData) {
    if (/\.(js|ts|mjs|cjs)$/.test(f.path)) {
      const requires = extractRequires(f.content);
      for (const req of requires) {
        const resolved = resolveRequirePath(f.path, req, filesData);
        if (resolved) {
          referencedFiles.add(resolved);
        }
      }
    }
  }

  const unrequiredFiles = filesData.filter(f => {
    const isEntryOrConfig = /^(package\.json|README|\.gitignore|scripts\/|tests\/|docs\/|index\.js)/.test(f.path);
    if (isEntryOrConfig) return false;
    return !referencedFiles.has(f.path);
  });

  const sortedBySize = [...filesData].sort((a, b) => b.size - a.size);
  const largestFiles = sortedBySize.slice(0, 20);
  const generatedFiles = filesData.filter(f => f.isGenerated);

  const reportDate = new Date().toISOString();
  
  return {
    reportDate,
    totalFiles: filesData.length,
    totalSize: filesData.reduce((acc, f) => acc + f.size, 0),
    folderStats,
    systemStats,
    largestFiles: largestFiles.map(f => ({ path: f.path, size: f.size })),
    generatedFiles: generatedFiles.map(f => f.path),
    unrequiredFiles: unrequiredFiles.map(f => f.path),
    filesData: filesData.map(f => ({
      path: f.path,
      size: f.size,
      system: f.system,
      quoteCount: f.quoteCount,
      isGenerated: f.isGenerated
    }))
  };
}

function inferSystem(relPath) {
  const parts = relPath.split('/');
  if (parts.length > 1) {
    if (parts[0] === 'src' || parts[0] === 'lib') {
      return parts[1] || 'core';
    }
    return parts[0];
  }
  return 'root';
}

function countInlineQuotes(content) {
  let count = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"' || char === "'" || char === '`') {
      count++;
    }
  }
  return count;
}

function checkIsGenerated(filename, content) {
  if (/\.(min|generated)\./.test(filename)) return true;
  const header = content.slice(0, 500).toLowerCase();
  if (header.includes('@generated') || header.includes('auto-generated') || header.includes('do not edit')) {
    return true;
  }
  return false;
}

function extractRequires(content) {
  const requires = [];
  const requireRegex = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = requireRegex.exec(content)) !== null) {
    requires.push(match[1]);
  }
  const importRegex = /\bfrom\s+['"]([^'"]+)['"]/g;
  while ((match = importRegex.exec(content)) !== null) {
    requires.push(match[1]);
  }
  return requires;
}

function resolveRequirePath(currentFilePath, reqPath, filesData) {
  if (!reqPath.startsWith('.')) return null;
  const currentDir = path.dirname(currentFilePath);
  let resolved = path.join(currentDir, reqPath).replace(/\\/g, '/');
  resolved = path.normalize(resolved).replace(/\\/g, '/');
  
  const extensions = ['', '.js', '.json', '.ts', '.mjs', '.cjs', '/index.js'];
  for (const ext of extensions) {
    const testPath = resolved + ext;
    const found = filesData.find(f => f.path === testPath);
    if (found) return found.path;
  }
  return null;
}

function generateReportMarkdown(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    throw new Error(`generateReportMarkdown: expected metrics object, received ${typeof metrics}`);
  }

  let md = `# Tree Census Report\n\n`;
  md += `**Date:** ${metrics.reportDate}\n`;
  md += `**Total Files:** ${metrics.totalFiles}\n`;
  md += `**Total Size:** ${(metrics.totalSize / 1024).toFixed(2)} KB\n\n`;

  md += `## Size per System\n\n`;
  md += `| System | File Count | Total Size (Bytes) |\n`;
  md += `|---|---|---|\n`;
  for (const [sys, data] of Object.entries(metrics.systemStats)) {
    md += `| ${sys} | ${data.count} | ${data.size} |\n`;
  }

  md += `\n## Size per Folder\n\n`;
  md += `| Folder | File Count | Total Size (Bytes) |\n`;
  md += `|---|---|---|\n`;
  for (const [folder, data] of Object.entries(metrics.folderStats)) {
    md += `| ${folder} | ${data.count} | ${data.size} |\n`;
  }

  md += `\n## Largest Files (Top 20)\n\n`;
  md += `| Path | Size (Bytes) |\n`;
  md += `|---|---|\n`;
  for (const f of metrics.largestFiles) {
    md += `| ${f.path} | ${f.size} |\n`;
  }

  md += `\n## Generated Files\n\n`;
  if (metrics.generatedFiles.length === 0) {
    md += `*None detected.*\n`;
  } else {
    for (const f of metrics.generatedFiles) {
      md += `- ${f}\n`;
    }
  }

  md += `\n## Files Nothing Requires (Unrequired)\n\n`;
  if (metrics.unrequiredFiles.length === 0) {
    md += `*None detected.*\n`;
  } else {
    for (const f of metrics.unrequiredFiles) {
      md += `- ${f}\n`;
    }
  }

  return md;
}

if (require.main === module) {
  try {
    const metrics = measureTree();
    const reportMd = generateReportMarkdown(metrics);
    console.log(reportMd);
  } catch (err) {
    console.error(`Error running tree census:`, err.message);
    process.exit(1);
  }
}

module.exports = {
  measureTree,
  generateReportMarkdown
};
