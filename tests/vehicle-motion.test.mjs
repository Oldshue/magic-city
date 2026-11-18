import test from 'node:test';
import assert from 'node:assert/strict';
import {
  carFootprintBlocked, clearCameraFraction, driverApproach, carWorldPoint, hitsMovingObstacle,
  setCarBounds, stepSedanControls, sedanYawRate, frontWheelAngle, createSedanRide,
  stepSedanRide, HALF_TRACK, FRONT_AXLE_Z, FORD_TUDOR, LARGE_SEDAN,
} from '../src/engine/vehicle-motion.mjs';

const storefront = {minX:18,maxX:42,minZ:14,maxZ:38};

test('the long axis fits along the curb and stops a sedan turning through a facade', () => {
  assert.equal(carFootprintBlocked([storefront], 25, 11.5, Math.PI / 2), false);
  assert.equal(carFootprintBlocked([storefront], 25, 12, 0), true);
  assert.equal(carFootprintBlocked([storefront], 25, 11, 0), false);
});

test('the chase boom shortens before a wall and stays extended on clear streets', () => {
  assert.equal(clearCameraFraction([storefront], 11, 18, 11, 27), 1);
  const t = clearCameraFraction([storefront], 12, 18, 23, 19);
  assert.ok(t > 0.45 && t < 0.54);
  assert.equal(clearCameraFraction([storefront], 12, 18, 6, 18), 1);
});

test('boarding from the passenger side routes around a clear end of the car', () => {
  const rearWall = {minX:-1.9,maxX:1.9,minZ:-4,maxZ:-2.43};
  const route = driverApproach([rearWall],0,0,0,-2,0);
  assert.deepEqual(route.at(-1),[1.54,-.18]);
  assert.ok(route.some(([x,z])=>x>1.5 && z>2.5));
  assert.ok(route.every(([x,z])=>Math.abs(x)>1.2 || Math.abs(z)>2.5));
  const frontWall = {minX:-1.9,maxX:1.9,minZ:2.42,maxZ:4};
  assert.equal(driverApproach([rearWall,frontWall],0,0,0,-2,0),null);
});

test('the player can approach a driver door from the edge of a curbside building', () => {
  const path = driverApproach([storefront],25,11.5,Math.PI/2,25,14);
  assert.ok(path, 'can move away from the wall');
  assert.ok(path[0][1]<13.72);
  assert.ok(path.at(-1)[1]<11);
});

test('a side step clears a tilted parked car but a point at the open door still hits the body', () => {
  const heading = Math.PI/4;
  const parked = setCarBounds({},2,3,heading);
  assert.equal(hitsMovingObstacle(parked,...carWorldPoint(2,3,heading,1.54,0),.45),true);
  assert.equal(hitsMovingObstacle(parked,...carWorldPoint(2,3,heading,1.67,0),.45),false);
});


test('steering follows travel direction and the inside front tire turns farther', () => {
  const car = {speed:0, steeringAngle:0};
  stepSedanControls(car, 0, 1, false, 1);
  assert.ok(car.steeringAngle > 0.47);
  assert.equal(sedanYawRate(car.speed, car.steeringAngle), 0);
  assert.ok(frontWheelAngle(car.steeringAngle, HALF_TRACK) > frontWheelAngle(car.steeringAngle, -HALF_TRACK));
  assert.ok(sedanYawRate(4, car.steeringAngle) > 0);
  assert.ok(sedanYawRate(-4, car.steeringAngle) < 0);
  car.speed = 20;
  stepSedanControls(car, 1, 1, false, 1);
  assert.ok(car.speed <= 22);
  assert.ok(car.steeringAngle < 0.04);
  car.speed = 0.7;
  stepSedanControls(car, -1, 0, false, 0.12);
  assert.equal(car.speed, 0, 'the brake step stops at zero');
  assert.equal(car.braking, true);
  stepSedanControls(car, -1, 0, false, 0.12);
  assert.ok(car.speed < 0);
});

test('body leans under load and a raised tire reaches the bump stop without clipping', () => {
  const ride = createSedanRide();
  stepSedanRide(ride, 0, 0, 0);
  for (let frame=0; frame<42; frame++) stepSedanRide(ride, 6, 3, 1/60);
  assert.ok(ride.pitch.value < -0.035, 'the nose lifts under acceleration');
  assert.ok(ride.roll.value > 0.03, 'the chassis leans out of the turn');
  for (let frame=0; frame<24; frame++) stepSedanRide(ride, -8, 0, 1/60);
  assert.ok(ride.pitch.value > 0.033, 'the nose dips under braking');

  ride.support[0] = 0.14;
  stepSedanRide(ride, -8, 0, 1/60);
  const frontLeftBody = ride.heave.value - HALF_TRACK * Math.sin(ride.roll.value) - FRONT_AXLE_Z * Math.sin(ride.pitch.value);
  assert.ok(ride.support[0] - frontLeftBody <= 0.064, 'the corner clears the tire at full compression');
  for (let frame=0; frame<78; frame++) stepSedanRide(ride, 0, 0, 1/60);
  assert.ok(ride.pitch.value < 0 && ride.roll.value < 0, 'the body settles on the raised left front');
});

test('the Tudor clears a shorter parking space and its walking collider follows its body', () => {
  assert.ok(Math.abs(FORD_TUDOR.wheelbase/0.0254 - 103.5)<.01);
  const parkingEdge = {minX:-1.2,maxX:1.2,minZ:2.06,maxZ:2.21};
  assert.equal(carFootprintBlocked([parkingEdge],0,0,0,FORD_TUDOR),false);
  assert.equal(carFootprintBlocked([parkingEdge],0,0,0),true);

  const heading = Math.PI/3;
  const ford = setCarBounds({},2,3,heading,{configuration:FORD_TUDOR});
  const sedan = setCarBounds({},2,3,heading);
  const step = carWorldPoint(2,3,heading,1.18,.2);
  assert.equal(hitsMovingObstacle(ford,...step,.25),false);
  assert.equal(hitsMovingObstacle(sedan,...step,.25),true);
  assert.deepEqual(driverApproach([],0,0,0,1.6,.2,FORD_TUDOR).at(-1),
    [FORD_TUDOR.driverMark.x,FORD_TUDOR.driverMark.z]);
});

test('the Tudor builds speed more slowly and turns tighter at the same parking speed', () => {
  const ford = {speed:0,steeringAngle:0,configuration:FORD_TUDOR};
  const sedan = {speed:0,steeringAngle:0,configuration:LARGE_SEDAN};
  for (let frame=0;frame<60;frame++) {
    stepSedanControls(ford,1,0,false,1/60);
    stepSedanControls(sedan,1,0,false,1/60);
  }
  assert.ok(ford.speed>5 && sedan.speed-ford.speed>2);
  for (const car of [ford,sedan]) {
    for (let frame=0;frame<45;frame++) {
      car.speed=2.5;
      stepSedanControls(car,0,1,false,1/60);
    }
  }
  assert.ok(sedanYawRate(2.5,ford.steeringAngle,FORD_TUDOR.wheelbase)>
    1.2*sedanYawRate(2.5,sedan.steeringAngle,LARGE_SEDAN.wheelbase));
  assert.ok(frontWheelAngle(ford.steeringAngle,FORD_TUDOR.halfTrack,FORD_TUDOR.wheelbase)>
    frontWheelAngle(ford.steeringAngle,-FORD_TUDOR.halfTrack,FORD_TUDOR.wheelbase));
});
