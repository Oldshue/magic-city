/** Shop sales use cents and commit when the player takes the item. */
export const POCKET_SQUARES = Object.freeze({
  oxblood: Object.freeze({name:'Oxblood silk', color:0xa63c48}),
  champagne: Object.freeze({name:'Champagne silk', color:0xe2c282}),
});

export function pocketSquare(id) {
  return typeof id === 'string' && Object.hasOwn(POCKET_SQUARES, id) ? POCKET_SQUARES[id] : null;
}

export const SHOP_MENUS = Object.freeze({
  chemist: Object.freeze({
    person: 'Nathaniel Brooks', item: 'Lemon phosphate', price: 5,
    greeting: 'Want a lemon phosphate? The fountain’s cold.',
    familiar: 'A phosphate again? The first one usually brings people back.',
    question: 'Ask about Morris Avenue',
    reply: 'Most of my trade comes up Morris Avenue after the railway shift. Stand at the window and you can count the porters by their red caps.',
    ordered: 'I’ll fix you a glass.',
    ready: 'Here you go. Plenty of ice.',
  }),
  lunch: Object.freeze({
    person: 'Ada Ellis', item: 'Coffee', price: 15,
    greeting: 'Coffee’s fresh. I put a pot on when the first streetcar came by.',
    familiar: 'Back for another coffee? I kept the pot warm.',
    question: 'Ask about the lunch crowd',
    reply: 'The secretaries have the window seats until one. Then the streetcar men come in from Morris Avenue. By two I’m washing cups.',
    ordered: 'One coffee coming up.',
    ready: 'There’s cream on the counter.',
  }),
  tailor: Object.freeze({
    person: 'Jonah Walker', item: 'Silk pocket square', price: 25,
    greeting: 'Come in. Here for a fitting, or just a bit of color?',
    familiar: 'Good to see you again. Which silk would you like today?',
    question: 'Ask about station deliveries',
    reply: 'If it’s for Terminal Station, pin the name inside the coat. I send the finished work down with the afternoon parcels.',
    ordered: 'I’ll fold it for your breast pocket.',
    ready: 'There you are. Let just the edge of the silk show.',
  }),
});

const STARTING_CENTS = 100;
const entries = Object.entries(SHOP_MENUS);

export function createShopState() {
  const sales = new Map(entries.map(([shop])=>[shop,0]));
  const orders = new Map();
  const ownedSquares = new Set();
  let worn = null;

  function cash() {
    return STARTING_CENTS - entries.reduce((spent,[shop,menu])=>spent + sales.get(shop)*menu.price,0);
  }
  function available() {
    let reserved = 0;
    for (const shop of orders.keys()) reserved += SHOP_MENUS[shop].price;
    return cash() - reserved;
  }

  return {
    cash, available,
    visited(shop) { return sales.get(shop) > 0; },
    status(shop) { return orders.get(shop)?.phase; },
    choice(shop) { return orders.get(shop)?.choice; },
    ownsSquare(id) { return ownedSquares.has(id); },
    appearance() { return worn; },
    wear(id) {
      if (!ownedSquares.has(id)) return false;
      worn = id;
      return true;
    },
    order(shop, choice = null) {
      if (!sales.has(shop) || orders.has(shop) || available() < SHOP_MENUS[shop].price) return false;
      if (shop === 'tailor' && (!pocketSquare(choice) || ownedSquares.has(choice))) return false;
      orders.set(shop,{phase:'serving',choice});
      return true;
    },
    served(shop) {
      const order = orders.get(shop);
      if (order?.phase !== 'serving') return false;
      order.phase = 'ready';
      return true;
    },
    collect(shop) {
      const order = orders.get(shop);
      if (order?.phase !== 'ready') return false;
      orders.delete(shop);
      sales.set(shop,sales.get(shop)+1);
      if (shop === 'tailor') {
        ownedSquares.add(order.choice);
        worn = order.choice;
      }
      return true;
    },
    save() {
      return {version:2,sales:Object.fromEntries(sales),squares:[...ownedSquares],worn};
    },
    restore(saved) {
      if ((saved?.version !== 1 && saved?.version !== 2) || !saved.sales || orders.size) return false;
      const legacy = saved.version === 1;
      const squares = legacy ? [] : saved.squares;
      const appearance = legacy ? null : saved.worn;
      if (!Array.isArray(squares) || squares.some(id=>!pocketSquare(id))
          || new Set(squares).size !== squares.length
          || (appearance === null ? squares.length > 0 : !squares.includes(appearance))) return false;
      const counts = new Map();
      let spent = 0;
      for (const [shop,menu] of entries) {
        const count = legacy && shop === 'tailor' ? 0 : saved.sales[shop];
        if (!Number.isSafeInteger(count) || count < 0 || count > STARTING_CENTS / menu.price
            || (shop === 'tailor' && count !== squares.length)) return false;
        spent += count * menu.price;
        counts.set(shop,count);
      }
      if (spent > STARTING_CENTS) return false;
      for (const [shop,count] of counts) sales.set(shop,count);
      ownedSquares.clear();
      for (const id of squares) ownedSquares.add(id);
      worn = appearance;
      return true;
    },
  };
}
