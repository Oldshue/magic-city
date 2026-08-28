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
 * Sloss Furnaces) that together are a testament to Birmingham itself: why
 * the city exists, what it built, and what it is proud of. Informative,
 * period-voiced, and facing forward — no scores settled with anyone.
 * Positions are world meters [x,z] per city-plan.json.
 */
export const DIVERGENCE_EXHIBIT = [
  {
    id: 'exhibit-terminal-freight-notice',
    district: 'terminal-quarter',
    position: [-420, -150],
    title: 'TERMINAL STATION',
    body: `Completed 1909. P. Thornton Marye of Washington, architect. The central waiting room spans seven thousand six hundred square feet beneath a dome sixty-four feet across, raised on the Guastavino tile system; the twin towers stand one hundred thirty feet. Through these gates run the Southern, the Frisco, the Central of Georgia, the Seaboard, and the Queen & Crescent. The city grid outside was platted in 1871 where the Alabama & Chattanooga crossed the South & North Alabama line — the townsite took its name from the iron city of England.`,
  },
  {
    id: 'exhibit-bank-lobby-differential',
    district: 'heaviest-corner',
    position: [-42, 34],
    title: 'THE HEAVIEST CORNER ON EARTH',
    body: `Four steel-frame towers stand on this crossing of Twentieth Street and First Avenue North: the Woodward Building, 1902; the Brown Marx Building, 1906; the Empire Building, 1909; and the American Trust and Savings Bank Building, 1912. The Jemison Magazine surveyed the four in 1911 under the heading "Birmingham to Have the Heaviest Corner in the South." The town's promoters improved the claim to the heaviest corner on Earth, and the name has held. The steel in every floor above you was rolled in this valley.`,
  },
  {
    id: 'exhibit-tci-lobby-woodward',
    district: 'heaviest-corner',
    position: [-48, -12],
    title: 'IRON, COAL, AND LIMESTONE',
    body: `A blast furnace is fed on three minerals: iron ore, coking coal, and limestone. Jones Valley holds all three in working quantity within sight of one another — red hematite in the ridge south of this street, coal in the fields beyond it, limestone and dolomite beneath the valley floor. It is the only place on Earth where the three occur together so closely. The furnaces here feed themselves inside a ten-mile haul, and the seam of red ore runs so shallow that the ridge itself carries its color.`,
  },
  {
    id: 'exhibit-vulcan-overlook',
    district: 'red-mountain-crest-vulcan-park',
    position: [0, 1140],
    title: 'VULCAN',
    body: `CAST OF SLOSS NO. 2 PIG IRON, BIRMINGHAM, 1904. GIUSEPPE MORETTI, SCULPTOR. EXHIBITED AT THE LOUISIANA PURCHASE EXPOSITION, ST. LOUIS, WHERE HE TOOK THE GRAND PRIZE. RAISED TO THIS SUMMIT BY THE PEOPLE'S SENTINEL FUND, 1922. Fifty-six feet from sandal to spear point, one hundred twenty tons, poured entire from the ore of the mountain on which he stands — the largest cast-iron statue in the world. The god of the forge, at the forge's own door.`,
  },
  {
    id: 'exhibit-sloss-extra',
    district: 'furnace-row-sloss-flats',
    position: [150, -670],
    title: 'CITY FURNACES',
    body: `Sloss No. 1 and No. 2, blown in 1882, Colonel James Withers Sloss, founder. Charged around the clock with valley ore, Pratt seam coke, and valley limestone; the casting sheds pour by night and the glow carries to the ridge. Visitors are advised the yard operates continuously — mind the slag runners, the ladle paths, and the whistle schedule. Pig iron from these stacks ships from the adjoining reservation sidings to every state in the South and to ports beyond.`,
  },
];
