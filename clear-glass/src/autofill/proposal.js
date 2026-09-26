'use strict';
/**
 * clear-glass/src/autofill/proposal.js — cover letters and freelance
 * proposals from an autofill profile.
 *
 * §0.39.265 — James: "expand the job application autofill. really struggling
 * for money, maybe add fiverr and upwork support?"
 *
 *   fillTemplate(text, vars)   {{placeholder}} substitution; reports what is
 *                              left unfilled so nothing half-written is sent
 *   profileVars(profile)       the placeholders a profile can fill
 *   buildProposalPrompt(...)   a prompt for the co-pilot to draft a proposal
 *                              for one job post (Upwork, Fiverr or a job ad)
 *                              from the profile — told never to invent
 *                              experience the profile does not state
 *
 * Pure (no DOM, no network): the IPC handler (ipc/bridge.js, autofill:proposal)
 * sends the prompt through the same co-pilot the on-screen answers use.
 * Nothing here submits anything — a draft is shown to the person to edit.
 */

const PLACEHOLDER = /\{\{\s*([\w-]+)\s*\}\}/g;

/** fillTemplate("Hi {{client}}, I'm {{first_name}}", vars) → { text, missing: ['client'] } */
function fillTemplate(text, vars = {}) {
  const missing = new Set();
  const out = String(text || '').replace(PLACEHOLDER, (m, key) => {
    const k = key.toLowerCase().replace(/-/g, '_');
    const v = vars[k];
    if (v === undefined || v === null || String(v).trim() === '') { missing.add(k); return m; }
    return String(v);
  });
  return { text: out, missing: [...missing] };
}

/** profileVars(profile) — every placeholder a profile can fill, by snake_case name. */
function profileVars(profile = {}) {
  const f = profile.fields || {}, d = profile.documents || {};
  const first = f['given-name'] || (f.name || '').split(' ')[0] || '';
  const full = f.name || [f['given-name'], f['family-name']].filter(Boolean).join(' ');
  return {
    name: full, full_name: full, first_name: first, last_name: f['family-name'] || '',
    email: f.email || '', phone: f.tel || '',
    title: f['organization-title'] || f.headline || '', current_title: f['organization-title'] || '', headline: f.headline || '',
    current_company: f.organization || '', employer: f.organization || '',
    years: f['years-experience'] || '', years_experience: f['years-experience'] || '',
    skills: f.skills || '', summary: f.summary || '', rate: f['hourly-rate'] || '', hourly_rate: f['hourly-rate'] || '',
    hours_per_week: f['hours-per-week'] || '', languages: f.languages || '',
    city: f['address-level2'] || '', country: f['country-name'] || f.country || '',
    linkedin: d.linkedinUrl || '', portfolio: d.portfolioUrl || f.url || '', website: f.url || d.portfolioUrl || '',
    github: f.github || '', upwork: f['upwork-url'] || '', fiverr: f['fiverr-url'] || '',
    available_from: f['available-from'] || '', notice_period: f['notice-period'] || '',
  };
}

const PLATFORM_GUIDE = {
  upwork: 'This is an Upwork proposal (the "cover letter" box). Open with the client’s actual problem in one line, show one or two directly relevant results from the profile, propose a first concrete step, and end with one short question for the client. No greetings longer than "Hi," and no "Dear Hiring Manager".',
  fiverr: 'This is a Fiverr offer / reply to a buyer request. Be short and concrete: what will be delivered, in how many days, and what the buyer needs to provide. Mention the relevant gig skill. No long introductions.',
  job: 'This is a cover letter for a job application. Three short paragraphs: why this role, the most relevant evidence from the profile, and a close. Plain, confident, specific to the posting.',
};

/**
 * buildProposalPrompt({ profile, jobPost, platform, length, tone, extra })
 * → { prompt } or { error }. jobPost is the text of the posting (pasted, or
 * read from the open tab). platform: upwork | fiverr | job.
 */
function buildProposalPrompt({ profile, jobPost, platform = 'upwork', length = 'short', tone = 'friendly and professional', extra = '' } = {}) {
  if (!profile || !profile.fields) return { error: 'pick an autofill profile' };
  const post = String(jobPost || '').replace(/\s+\n/g, '\n').trim();
  if (post.length < 40) return { error: 'paste the job post (or read it from the open tab) first' };
  const v = profileVars(profile);
  const facts = [
    v.full_name && `Name: ${v.full_name}`, v.headline && `Headline: ${v.headline}`, v.current_title && `Current title: ${v.current_title}${v.current_company ? ` at ${v.current_company}` : ''}`,
    v.years && `Years of experience: ${v.years}`, v.skills && `Skills: ${v.skills}`, v.summary && `Summary: ${v.summary}`,
    v.rate && `Hourly rate: ${v.rate}`, v.hours_per_week && `Available: ${v.hours_per_week} hours/week`, v.languages && `Languages: ${v.languages}`,
    v.portfolio && `Portfolio: ${v.portfolio}`, v.github && `GitHub: ${v.github}`, v.linkedin && `LinkedIn: ${v.linkedin}`,
  ].filter(Boolean);
  if (!facts.length) return { error: 'the profile is empty — add a headline, skills and a summary first' };
  const template = profile.documents && (platform === 'job' ? (profile.documents.coverLetter || profile.documents.proposal) : (profile.documents.proposal || profile.documents.coverLetter));
  const words = length === 'long' ? '250–350' : length === 'medium' ? '150–220' : '80–140';
  const prompt = [
    `Write a ${platform === 'job' ? 'cover letter' : 'proposal'} for the job post below, in the first person, as the freelancer/applicant described.`,
    PLATFORM_GUIDE[platform] || PLATFORM_GUIDE.upwork,
    `Length: ${words} words. Tone: ${tone}.`,
    'Use ONLY facts from "About me". Never invent clients, numbers, years, tools or results that are not there — if something the post asks for is missing, skip it rather than make it up.',
    'Refer to specifics in the post so it could not be sent to any other job. No placeholders like [Client Name]; no subject line; output only the text to send.',
    template ? `Match the voice and structure of this template of theirs (fill its gaps from the post):\n---\n${fillTemplate(template, v).text}\n---` : null,
    extra ? `Also: ${String(extra).trim()}` : null,
    `About me:\n${facts.join('\n')}`,
    `Job post:\n---\n${post.slice(0, 6000)}\n---`,
  ].filter(Boolean).join('\n\n');
  return { prompt };
}

module.exports = { fillTemplate, profileVars, buildProposalPrompt, PLATFORM_GUIDE };
