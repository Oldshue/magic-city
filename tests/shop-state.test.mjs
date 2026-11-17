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
