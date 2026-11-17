/** Counter purchases use cents and commit when the player takes the drink. */
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
});

const STARTING_CENTS = 100;
const entries = Object.entries(SHOP_MENUS);

export function createShopState() {
  const sales = new Map(entries.map(([shop])=>[shop,0]));
  const orders = new Map();

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
    status(shop) { return orders.get(shop); },
    order(shop) {
      if (!sales.has(shop) || orders.has(shop) || available() < SHOP_MENUS[shop].price) return false;
      orders.set(shop,'serving');
      return true;
    },
    served(shop) {
      if (orders.get(shop) !== 'serving') return false;
      orders.set(shop,'ready');
      return true;
    },
    collect(shop) {
      if (orders.get(shop) !== 'ready') return false;
      orders.delete(shop);
      sales.set(shop,sales.get(shop)+1);
      return true;
    },
    save() { return { version:1, sales:Object.fromEntries(sales) }; },
    restore(saved) {
      if (saved?.version !== 1 || !saved.sales || orders.size) return false;
      let spent = 0;
      for (const [shop,menu] of entries) {
        const count = saved.sales[shop];
        if (!Number.isSafeInteger(count) || count < 0 || count > STARTING_CENTS / menu.price) return false;
        spent += count * menu.price;
      }
      if (spent > STARTING_CENTS) return false;
      for (const [shop] of entries) sales.set(shop,saved.sales[shop]);
      return true;
    },
  };
}
