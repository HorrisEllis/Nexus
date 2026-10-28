'use strict';
/**
 * clear-glass/src/autofill/gig-pricing.js — the blocks that fill Fiverr's Scope & Pricing page from a written gig (FP5, 0.60.221).
 * Pure: a parsed gig (gig.js parseGig) and his row choices in, the blocks out. Nothing here touches a page; FG5 resolves each block's target
 * on the page and runs it through the macro run, which waits for each gate.
 * Spec: clear-glass/spec/flow-cores.spec MOD-FC-PRICING · Map: docs/2026-10-28-first-principles-phasemap.spec FP5
 *
 * James, 2026-10-28: "Get fiverr working. it needs to do the drop down menus. one by one" · "only whats needed for a fact."
 * The fact (F5): his screenshot of the page — per tier (BASIC, STANDARD, PREMIUM) a "Name your package" box, a "Describe the details of your
 * offering" box and a DELIVERY TIME dropdown; then rows of SELECT dropdowns ("Number of APIs integrated", …) and of checkboxes ("Data Syncing",
 * …), one per tier. Only those controls are here. The editor's other pages have no facts on record yet; their blocks wait on a page read.
 *
 * A block's target names the control as a person sees it — the tier's column and the box's placeholder, or the row's label — never a class
 * name. Its gate's selector is '$target' and a choice's gate text '$option': the runner puts the resolved control's selector and the option
 * actually chosen (option-match.js) there before polling — so "3" days is gated on "3 Days", never on "30 Days" containing a 3.
 * No block saves, continues or publishes (his words 0.39.301: "Not automate talking or posting"): the only actions emitted are type,
 * choose and check, none of which presses a button.
 */

const TIERS = Object.freeze(['basic', 'standard', 'premium']);
const COLUMN = Object.freeze({ basic: 'BASIC', standard: 'STANDARD', premium: 'PREMIUM' });
const PRICING_LABELS = Object.freeze({ name: 'Name your package', description: 'Describe the details of your offering', delivery: 'DELIVERY TIME' });

/**
 * pricingBlocks(gig, { rows }) → { blocks, why }
 *   rows: [{ label: 'Number of APIs integrated', basic: '1', standard: '3', premium: '5' }, { label: 'Data Syncing', basic: false, … }]
 *   a string is a SELECT row's option (chosen one by one); true/false is a checkbox row.
 */
function pricingBlocks(gig, { rows = [] } = {}) {
  const packages = gig && gig.packages;
  const tiers = packages ? TIERS.filter(t => packages[t]) : [];
  if (!tiers.length) return { blocks: [], why: 'the gig has no packages' };
  const blocks = [];
  for (const t of tiers) {
    const p = packages[t], col = COLUMN[t];
    if (p.name) blocks.push({ action: 'type', label: `${col}: package name`, data: { target: { column: col, placeholder: PRICING_LABELS.name }, text: String(p.name) }, gate: { selector: '$target', value: String(p.name) } });
    if (p.description) blocks.push({ action: 'type', label: `${col}: description`, data: { target: { column: col, placeholder: PRICING_LABELS.description }, text: String(p.description) }, gate: { selector: '$target', value: String(p.description) } });
    if (Number.isFinite(p.deliveryDays)) blocks.push({ action: 'choose', label: `${col}: delivery time`, data: { target: { column: col, shows: PRICING_LABELS.delivery }, option: String(p.deliveryDays) }, gate: { selector: '$target', text: '$option' } });
  }
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !r.label) continue;
    for (const t of tiers) {
      const v = r[t], col = COLUMN[t];
      if (v === undefined || v === null || v === '') continue;
      if (typeof v === 'boolean') blocks.push({ action: 'check', label: `${col}: ${r.label}`, data: { target: { column: col, row: r.label }, checked: v }, gate: null });
      else blocks.push({ action: 'choose', label: `${col}: ${r.label}`, data: { target: { column: col, row: r.label }, option: String(v) }, gate: { selector: '$target', text: '$option' } });
    }
  }
  return { blocks, why: null };
}

module.exports = { pricingBlocks, TIERS, COLUMN, PRICING_LABELS };
