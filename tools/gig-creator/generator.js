'use strict';
/**
 * tools/gig-creator/generator.js
 * Generates Fiverr gigs, Upwork profiles, and social posts
 * Usage: node generator.js [--platform fiverr|upwork|social] [--gig 001|002|003]
 */

const fs   = require('fs');
const path = require('path');

const gigs = JSON.parse(fs.readFileSync(path.join(__dirname, 'gigs.json'), 'utf8'));

function printFiverrGig(gig) {
  console.log('\n' + '═'.repeat(60));
  console.log(`FIVERR GIG — ${gig.id}`);
  console.log('═'.repeat(60));
  console.log(`\nTITLE:\n${gig.title}`);
  console.log(`\nCATEGORY: ${gig.category}`);
  console.log(`\nTAGS: ${gig.tags.join(', ')}`);
  console.log(`\nDESCRIPTION:\n${gig.description}`);
  console.log('\nPACKAGES:');
  for (const [key, pkg] of Object.entries(gig.packages)) {
    console.log(`\n  ${key.toUpperCase()} — ${pkg.name} — £${pkg.price} — ${pkg.delivery_days} days`);
    pkg.includes.forEach(i => console.log(`    • ${i}`));
  }
  if (gig.faq) {
    console.log('\nFAQ:');
    gig.faq.forEach(f => {
      console.log(`\n  Q: ${f.q}`);
      console.log(`  A: ${f.a}`);
    });
  }
}

function printUpworkGig(gig) {
  console.log('\n' + '═'.repeat(60));
  console.log(`UPWORK PROFILE — ${gig.id}`);
  console.log('═'.repeat(60));
  console.log(`\nTITLE:\n${gig.title}`);
  console.log(`\nRATE: £${gig.rate.min}–£${gig.rate.max}/hr`);
  console.log(`\nDESCRIPTION:\n${gig.description}`);
  console.log(`\nCOVER LETTER TEMPLATE:\n${gig.cover_letter_template}`);
}

function printSocial() {
  const s = gigs.social_posts;
  console.log('\n' + '═'.repeat(60));
  console.log('SOCIAL POSTS');
  console.log('═'.repeat(60));
  console.log('\nTWITTER/X:\n' + s.twitter);
  console.log('\nTHREADS:\n' + s.threads);
  console.log('\nLINKEDIN:\n' + s.linkedin);
}

const args = process.argv.slice(2);
const platform = args[args.indexOf('--platform') + 1] || 'all';
const gigId    = args[args.indexOf('--gig') + 1] || null;

const fiverrGigs = gigs.gigs.filter(g => g.platform === 'fiverr');
const upworkGigs = gigs.gigs.filter(g => g.platform === 'upwork');

if (platform === 'fiverr' || platform === 'all') {
  fiverrGigs
    .filter(g => !gigId || g.id.includes(gigId))
    .forEach(printFiverrGig);
}

if (platform === 'upwork' || platform === 'all') {
  upworkGigs
    .filter(g => !gigId || g.id.includes(gigId))
    .forEach(printUpworkGig);
}

if (platform === 'social' || platform === 'all') {
  printSocial();
}

console.log('\n' + '═'.repeat(60));
console.log('PROFILE:');
console.log(`Name:      ${gigs.profile.name}`);
console.log(`Tagline:   ${gigs.profile.tagline}`);
console.log(`Portfolio: ${gigs.profile.portfolio_url}`);
console.log(`GitHub:    ${gigs.profile.github}`);
console.log('═'.repeat(60) + '\n');
