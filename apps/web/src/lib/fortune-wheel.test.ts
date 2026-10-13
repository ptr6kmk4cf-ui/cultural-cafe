import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cityPoint } from './city-points';
import { sliceUnderPointer, spinRotation, wheelBoard, WHEEL_LIMIT } from './fortune-wheel';

test('the wheel keeps every person when the café is small', () => {
  const people = ['Inès', 'Mei', 'Lena'];
  assert.deepEqual(wheelBoard(people, WHEEL_LIMIT, () => 0), people);
});

test('a long list is cut to the wheel after a shuffle', () => {
  let n = 0;
  const random = () => {
    n += 1;
    return (n % 5) / 5;
  };
  const board = wheelBoard(['a', 'b', 'c', 'd', 'e', 'f'], 3, random);
  assert.equal(board.length, 3);
  assert.equal(new Set(board).size, 3);
  for (const name of board) assert.ok(['a', 'b', 'c', 'd', 'e', 'f'].includes(name));
});

test('a known city has a point on the map', () => {
  const buenos = cityPoint('Buenos Aires');
  assert.ok(buenos);
  assert.ok(buenos[0] < -50 && buenos[1] < -30);
  assert.ok(cityPoint('Kyoto'));
  assert.equal(cityPoint('Nowhereville'), null);
});

test('the spin stops on the slice it aimed at', () => {
  for (let count = 1; count <= 10; count++) {
    for (let index = 0; index < count; index++) {
      for (const jitter of [0.2, 0.5, 0.8]) {
        const rotation = spinRotation(index, count, 6, jitter);
        assert.equal(sliceUnderPointer(rotation, count), index);
      }
    }
  }
});
