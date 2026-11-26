import { describe, expect, it } from 'vitest';
import { buildTable, fromInitiativeTracker, type ITState, type Show } from '../src/table';

const SHOW: Show = { scene: '', playerHp: true, monsterHp: 'words', rolls: 5 };
// as Initiative Tracker's save-state event sends it: order added, no numbers
const STATE: ITState = {
	state: true,
	round: 3,
	name: 'Mill cellar',
	creatures: [
		{ name: 'Aria', initiative: 14, currentHP: 18, currentMaxHP: 27, hp: 27, status: [], player: true, enabled: true },
		{ name: 'Goblin', initiative: 17, currentHP: 3, currentMaxHP: 7, hp: 7, status: ['Prone'], enabled: true, active: true },
		{ name: 'Goblin', initiative: 9, currentHP: 0, currentMaxHP: 7, hp: 7, status: [], enabled: true },
		{ name: 'Bugbear', initiative: 20, currentHP: 27, currentMaxHP: 27, hp: 27, status: [], enabled: true, hidden: true },
		{ name: 'Wolf', display: 'Grey wolf', initiative: 14, currentHP: 11, currentMaxHP: 11, hp: 11, status: [], enabled: false },
		{ name: 'Borin', initiative: 14, currentHP: 30, currentMaxHP: 30, hp: 30, status: [], player: true, enabled: true },
	],
};

describe('fromInitiativeTracker', () => {
	it('sorts by initiative, keeps ties in the order added, numbers shared names, leaves out hidden and switched-off creatures', () => {
		const f = fromInitiativeTracker(STATE)!;
		expect(f.round).toBe(3);
		expect(f.current).toBe('Goblin 1');
		expect(f.combatants.map((c) => c.name)).toEqual(['Goblin 1', 'Aria', 'Borin', 'Goblin 2']);
		expect(f.combatants[0]).toEqual({ name: 'Goblin 1', hp: 3, maxHp: 7, player: false, conditions: ['Prone'] });
	});

	it('feeds the players\' table like a Quick Initiative fight', () => {
		const t = buildTable(fromInitiativeTracker(STATE), [], [], SHOW);
		expect(t.turn).toBe(0);
		expect(t.order).toEqual([
			{ name: 'Goblin 1', hp: 'bloodied', conditions: ['Prone'] },
			{ name: 'Aria', hp: '18/27', player: true },
			{ name: 'Borin', player: true, hp: '30/30' },
			{ name: 'Goblin 2', down: true, hp: 'down' },
		]);
	});

	it('does not say whose turn it is when that creature is hidden', () => {
		const s: ITState = { ...STATE, creatures: STATE.creatures!.map((c) => ({ ...c, active: c.name === 'Bugbear' })) };
		expect(fromInitiativeTracker(s)!.current).toBeNull();
		expect(buildTable(fromInitiativeTracker(s), [], [], SHOW).turn).toBeUndefined();
	});

	it('uses the display name, and the lowest first when the tracker is ascending', () => {
		const s: ITState = { state: true, round: 1, creatures: [
			{ name: 'Wolf', display: 'Grey wolf', initiative: 5 },
			{ name: 'Aria', initiative: 12, player: true },
		] };
		expect(fromInitiativeTracker(s, false)!.combatants.map((c) => c.name)).toEqual(['Grey wolf', 'Aria']);
	});

	it('shares no turn order before the fight starts, and nothing from junk', () => {
		expect(fromInitiativeTracker({ ...STATE, state: false })!.round).toBe(0);
		expect(buildTable(fromInitiativeTracker({ ...STATE, state: false }), [], [], SHOW).order).toEqual([]);
		expect(fromInitiativeTracker(null)).toBeNull();
		expect(fromInitiativeTracker({} as ITState)).toBeNull();
	});
});
