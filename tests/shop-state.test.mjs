import test from 'node:test';
import assert from 'node:assert/strict';
import {createShopState} from '../src/gameplay/shop-state.mjs';

test('counter service commits one charge when a finished drink is collected',()=>{
  const shop = createShopState();
  assert.equal(shop.cash(),100);
  assert.equal(shop.order('chemist'),true);
  assert.equal(shop.order('chemist'),false);
  assert.equal(shop.collect('chemist'),false);
  assert.equal(shop.cash(),100);
  assert.equal(shop.available(),95);
  assert.equal(shop.served('chemist'),true);
  assert.equal(shop.collect('chemist'),true);
  assert.equal(shop.collect('chemist'),false);
  assert.equal(shop.cash(),95);
  assert.equal(shop.visited('chemist'),true);
});

test('unfinished drinks preserve the two counters’ shared budget',()=>{
  const shop = createShopState();
  assert.equal(shop.restore({version:1,sales:{chemist:0,lunch:5}}),true);
  assert.equal(shop.order('lunch'),true);
  assert.equal(shop.order('chemist'),true);
  assert.equal(shop.available(),5);
  assert.equal(shop.cash(),25);
  assert.equal(shop.order('bank'),false);
  assert.equal(shop.restore({version:1,sales:{chemist:0,lunch:0}}),false);
  const reloaded = createShopState();
  assert.equal(reloaded.restore(shop.save()),true);
  assert.equal(reloaded.available(),25);
  assert.equal(reloaded.status('lunch'),undefined);
});

test('bad counter receipts leave valid progression intact',()=>{
  const shop = createShopState();
  assert.equal(shop.restore({version:1,sales:{chemist:1,lunch:1}}),true);
  assert.equal(shop.cash(),80);
  for (const sales of [{chemist:-2,lunch:1},{chemist:1.5,lunch:1},{chemist:2,lunch:7},{chemist:30,lunch:0}]){
    assert.equal(shop.restore({version:1,sales}),false);
    assert.equal(shop.cash(),80);
  }
});


test('silk finishes before pickup charges the shared wallet and equips the chosen square', () => {
  const shop = createShopState();
  assert.equal(shop.restore({version:1,sales:{chemist:1,lunch:1}}),true);
  assert.equal(shop.appearance(),null);
  assert.equal(shop.order('tailor','toString'),false);
  assert.equal(shop.order('tailor','oxblood'),true);
  assert.equal(shop.available(),55);
  assert.equal(shop.cash(),80);
  assert.equal(shop.appearance(),null);
  assert.equal(shop.collect('tailor'),false);
  assert.equal(shop.served('tailor'),true);
  assert.equal(shop.collect('tailor'),true);
  assert.equal(shop.appearance(),'oxblood');
  assert.equal(shop.cash(),55);
  assert.equal(shop.order('tailor','oxblood'),false);
  assert.equal(shop.order('tailor','champagne'),true);
  assert.equal(shop.served('tailor'),true);
  assert.equal(shop.collect('tailor'),true);
  assert.equal(shop.wear('oxblood'),true);
  assert.equal(shop.cash(),30);
  const saved = shop.save();
  const resumed = createShopState();
  assert.equal(resumed.restore(saved),true);
  assert.equal(resumed.appearance(),'oxblood');
  assert.equal(resumed.ownsSquare('champagne'),true);
  assert.equal(resumed.cash(),30);
  assert.equal(resumed.restore({...saved,worn:'saffron'}),false);
  assert.equal(resumed.restore({...saved,squares:['oxblood','oxblood']}),false);
  assert.equal(resumed.restore({...saved,sales:{...saved.sales,tailor:1}}),false);
  assert.equal(resumed.appearance(),'oxblood');
});
