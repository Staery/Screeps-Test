'use strict';

const utils = require('utils');

describe('room name helpers', () => {
  test('parseRoomName', () => {
    expect(utils.parseRoomName('W12N5')).toEqual({ x: -13, y: -6, wx: 12, wy: 5 });
    expect(utils.parseRoomName('E0S0')).toEqual({ x: 0, y: 0, wx: 0, wy: 0 });
    expect(utils.parseRoomName('sim')).toBeNull();
  });

  test('highways and source keeper rooms', () => {
    expect(utils.isHighway('W10N3')).toBe(true);
    expect(utils.isHighway('W3N20')).toBe(true);
    expect(utils.isHighway('W3N3')).toBe(false);
    expect(utils.isSourceKeeperRoom('W4N4')).toBe(true);
    expect(utils.isSourceKeeperRoom('E16S14')).toBe(true);
    expect(utils.isSourceKeeperRoom('W5N5')).toBe(false); // центр сектора
    expect(utils.isSourceKeeperRoom('W3N4')).toBe(false);
  });

  test('roomDistance works without Game.map', () => {
    expect(utils.roomDistance('W1N1', 'W3N2')).toBe(2);
    expect(utils.roomDistance('W0N0', 'E0N0')).toBe(1);
  });

  test('amountOf handles resources, stores and sources', () => {
    expect(utils.amountOf({ resourceType: 'energy', amount: 40 })).toBe(40);
    expect(utils.amountOf({ resourceType: 'H', amount: 40 })).toBe(0);
    expect(utils.amountOf({ store: { energy: 12 } })).toBe(12);
    expect(utils.amountOf({ energy: 3000 })).toBe(3000);
    expect(utils.amountOf(null)).toBe(0);
  });

  test('safe swallows errors and returns undefined', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(utils.safe('x', () => { throw new Error('boom'); })).toBeUndefined();
    expect(utils.safe('y', () => 5)).toBe(5);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
