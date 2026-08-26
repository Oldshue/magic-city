/**
 * content.js — Voice fragments and the Divergence exhibit for the narrative
 * layer. Text is drawn from docs/WORLD-BIBLE.md Section 6 (Voice) and
 * Section 1 (The Divergence); every exhibit body is under 120 words and
 * written in period voice, per the Narrative Designer brief.
 */

/** Newspaper mastheads recognized in readable title/body text, used to give
 * front-page treatment to any registered readable (ours or a district's)
 * that names one of these papers. Names/mottoes from WORLD-BIBLE.md §5. */
export const NEWSPAPER_MASTHEADS = [
  { match: 'Birmingham Ledger', name: 'THE BIRMINGHAM LEDGER', sub: 'VOICE OF THE VALLEY' },
  { match: 'Age-Herald', name: 'THE AGE-HERALD', sub: 'EVENING EDITION' },
  { match: 'Valley Worker', name: 'THE VALLEY WORKER', sub: 'LABOR WEEKLY' },
  { match: 'Magic City Messenger', name: 'THE MAGIC CITY MESSENGER', sub: 'FOURTH AVENUE WEEKLY' },
];

/**
 * detectMasthead — returns the masthead record if title/body names a known
 * paper, else null. Used by the readables panel to switch to front-page
 * styling automatically, for any interactive registered anywhere.
 * @param {string} title
 * @param {string} body
 * @returns {{match:string,name:string,sub:string}|null}
 */
export function detectMasthead(title, body) {
  const hay = `${title} ${body}`.toLowerCase();
  for (const m of NEWSPAPER_MASTHEADS) {
    if (hay.includes(m.match.toLowerCase())) return m;
  }
  return null;
}

/**
 * DIVERGENCE_EXHIBIT — 5 readables placed at plausible spots (station
 * concourse, a bank lobby doorway, the TCI lobby, the Vulcan overlook, and
 * Sloss Furnaces) that together tell the Pittsburgh Plus story: what it was,
 * the 1934 protest against its lingering differential, and what this city
 * became without it. Positions are world meters [x,z] per city-plan.json.
 */
export const DIVERGENCE_EXHIBIT = [
  {
    id: 'exhibit-terminal-freight-notice',
    district: 'terminal-quarter',
    position: [-420, -150],
    title: 'THE FREIGHT THAT NEVER RODE A CAR',
    body: `Ask any drummer who worked the northern trade before the Panic of aught-seven: steel poured at Ensley and steel poured at Pittsburgh were billed to the buyer as though both had ridden the same thousand miles of rail from Pennsylvania — freight charged on iron that never left Alabama ground. They called it the Pittsburgh Plus. It taxed our ore, our limestone, and our coal, and paid the difference north. President Woodward broke that yoke in November of 1907. Every ton that rolls through this concourse today rides its true freight, and not a mile more.`,
  },
  {
    id: 'exhibit-bank-lobby-differential',
    district: 'heaviest-corner',
    position: [-42, 34],
    title: 'THE DIFFERENTIAL, AND ITS END',
    body: `Elsewhere in the trade they are still arguing it. The Federal Trade Commission ordered the old Pittsburgh Plus system abolished in 1924 — a scheme that for two decades billed southern steel as though hauled from Pennsylvania mills it never saw. Even after that order, a lesser tariff, the so-called Birmingham differential, lingered on other men's books until Alabama's shippers protested it down in 1934. Independent since 1907, Tennessee Coal, Iron & Railroad never carried that weight at all — which is why these vaults, and this street's towers, rose a full generation ahead of schedule.`,
  },
  {
    id: 'exhibit-tci-lobby-woodward',
    district: 'heaviest-corner',
    position: [-48, -12],
    title: 'WOODWARD SAYS NO.',
    body: `THE BIRMINGHAM LEDGER, NOVEMBER 5, 1907 — TCI Declines Northern Bonds; 'Our Iron Will Carry Its Own Freight,' Declares President, as Syndicate of the South Rallies to the Rescue. Framed here since the tower opened: the lede that marked the day President Joseph H. Woodward refused the House of Morgan's rescue and kept Tennessee Coal, Iron & Railroad out of United States Steel's hands — and out from under the pricing scheme that would surely have followed it home.`,
  },
  {
    id: 'exhibit-vulcan-overlook',
    district: 'red-mountain-crest-vulcan-park',
    position: [0, 1140],
    title: 'SENTINEL OF THE MAGIC CITY',
    body: `CAST OF SLOSS NO. 2 PIG IRON FOR THE ST. LOUIS FAIR, 1904. RAISED TO THE SUMMIT BY THE PEOPLE'S SENTINEL FUND, 1922. Below him, six hundred forty thousand souls, and rising — a southern iron town that, for once, kept its own freight money. Where Pittsburgh once priced our ore as though it traveled a thousand miles to reach us, Birmingham's furnaces sold direct, undersold the whole Mason-Dixon line, and raised the towers you see from this rail. Vulcan does not face north in apology. He faces the fire that made him, and the city that fire built without asking Pennsylvania's leave.`,
  },
  {
    id: 'exhibit-sloss-extra',
    district: 'furnace-row-sloss-flats',
    position: [150, -670],
    title: 'EXTRA! BIRMINGHAM PASSES PITTSBURGH!',
    body: `THE BIRMINGHAM LEDGER, OCTOBER 1928, TWO CENTS — Mill men say the valley never looked back. Tonnage shipped south of the Mason-Dixon line now exceeds the Pittsburgh district's, the wire confirms, as Republic and Gulf States bring new strip mills on line at Fairfield and Bessemer. Made where it's mined: one ton of TC steel crosses this yard in ninety minutes — ore, limestone, coal, fire, all within sight of that stack. Ask your dealer why northern steel costs more to haul less.`,
  },
];
