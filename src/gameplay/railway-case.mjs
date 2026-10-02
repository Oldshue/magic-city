/** Fictional case within the existing Birmingham world canon. */
export const RAILWAY_CASE = {
  id: 'last-train', title: 'The Last Train Out',
  introduction: 'Birmingham, 1929. A railway clerk vanishes between the evening shift and the last train north. His wife leaves you a photograph and ten dollars. In this town, steel buys silence. Someone forgot to buy yours.',
  clues: [
    { id: 'docket', title: 'A torn freight docket', position: [-420, -138], requires: [], body: 'Behind the station noticeboard: a freight docket with a Tutwiler room number pencilled across it. The initials E.V. are circled. One coal car is listed twice.' },
    { id: 'ledger', title: 'The hotel carbon copy', position: [-320, -88], requires: ['porter-route'], body: 'The porter’s description leads you to a discarded carbon copy. Vale booked a room under the missing clerk’s name. A payment for “special carriage” was made before the clerk disappeared.' },
    { id: 'order', title: 'An oil-stained dispatch order', position: [150, -672], requires: ['singer-route'], body: 'At the furnace gate, a dispatch order bears Vale’s personal seal. It orders the clerk held in a freight shed, not put aboard a passenger train. The fresh ink matches the altered docket.' },
  ],
  witnesses: [
    { id: 'porter', name: 'Isaac Bell · station porter', position: [-454, -138], introduction: '“I carry bags, detective. I don’t carry secrets for free.”', choices: [
      { id: 'ask', text: 'Ask about the missing clerk.', response: '“He left with a man in a good coat. Tutwiler way. I remember the hotel car.”', grants: 'porter-route' },
      { id: 'show', text: 'Show the altered freight docket.', requires: ['docket'], response: '“E.V. That’s Edgar Vale, the freight dispatcher. He told me to forget which car they used.”', grants: 'porter-identification' },
      { id: 'pressure', text: 'Threaten to bring in the police.', response: '“You think a badge makes a man honest? Ask your question properly.”' },
    ] },
    { id: 'singer', name: 'Ruth Mercer · Savoy singer', position: [300, 49], introduction: '“A man can disappear in a city this loud. But I know that clerk’s voice.”', choices: [
      { id: 'ask', text: 'Ask what she heard after her set.', response: '“An argument behind the club. He said he wouldn’t sign another false consignment. Their car went toward Sloss.”', grants: 'singer-route' },
      { id: 'show', text: 'Show her the hotel carbon copy.', requires: ['ledger'], response: '“Vale. That’s the man. He paid for the room, then met the clerk here. Your clerk was alive when they left.”', grants: 'singer-identification' },
      { id: 'reassure', text: 'Promise to keep her name out of the papers.', response: '“Good. Find him before they make this a story about a missing drunk.”' },
    ] },
  ],
  accusationPosition: [-390, -138], accusationRequires: ['docket', 'porter-route', 'singer-route'],
  proofRequires: ['ledger', 'order', 'porter-identification', 'singer-identification'],
  suspects: [
    { id: 'vale', name: 'Edgar Vale · freight dispatcher', correct: true,
      proved: 'You lay out the seal, the carbon copy, and two independent identifications. Vale gives up the shed key. The clerk comes home alive. The coal ledger goes to the papers. For once, the city has to look at what keeps its furnaces burning.',
      failed: 'You named the right man, but you brought a hunch to a paper war. Vale’s solicitor dismantles your accusation. The clerk remains missing. Reopen the case and collect corroborating evidence.' },
    { id: 'bell', name: 'Isaac Bell · station porter', correct: false,
      failed: 'The porter is detained while the real dispatcher clears his books. Your accusation has cost an innocent man his job. Reopen the case: a witness’s fear is not proof of guilt.' },
    { id: 'mercer', name: 'Ruth Mercer · Savoy singer', correct: false,
      failed: 'The singer’s story checks out. By the time you admit it, Vale has burned the carbon copies. Reopen the case and follow the freight paperwork.' },
  ],
};
