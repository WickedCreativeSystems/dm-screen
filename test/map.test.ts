import { describe, expect, it } from 'vitest';
import { addTokens, box, cellName, colName, fogOff, fogString, initials, mapForPlayers, moveToken, parseMap, readCell, revealWords, setSeen } from '../src/map';

const SRC = '![[Cellar.png]] 20x14\nAria C4 blue\n[[Goblin]] 1 F7 red hidden\nGoblin 2\n# notes\nBorin T14';

describe('battle map', () => {
	it('reads the picture, the grid and the tokens', () => {
		const m = parseMap(SRC);
		expect(m).toMatchObject({ image: 'Cellar.png', cols: 20, rows: 14 });
		expect(m.tokens).toEqual([
			{ name: 'Aria', col: 2, row: 3, color: 'blue', hidden: false, index: 1 },
			{ name: 'Goblin 1', link: 'Goblin', col: 5, row: 6, color: 'red', hidden: true, index: 2 },
			{ name: 'Goblin 2', hidden: false, index: 3 },
			{ name: 'Borin', col: 19, row: 13, hidden: false, index: 5 },
		]);
	});

	it('takes a grid on its own line, a markdown picture, or neither', () => {
		expect(parseMap('grid 8x6\nAria A1')).toMatchObject({ image: null, cols: 8, rows: 6 });
		expect(parseMap('![](maps/Mill%20yard.webp)\n12x9')).toMatchObject({ image: 'maps/Mill yard.webp', cols: 12, rows: 9 });
		expect(parseMap('Aria B2')).toMatchObject({ image: null, cols: 10, rows: 10, tokens: [{ name: 'Aria', col: 1, row: 1 }] });
	});

	it('sets a token off the grid beside the map', () => {
		expect(parseMap('4x4\nAria E5').tokens[0]).toEqual({ name: 'Aria', hidden: false, index: 1 });
	});

	it('names cells past Z', () => {
		expect(colName(0)).toBe('A');
		expect(colName(25)).toBe('Z');
		expect(colName(26)).toBe('AA');
		expect(colName(59)).toBe('BH');
		for (const c of [0, 7, 25, 26, 40, 59]) expect(readCell(cellName(c, 9))).toEqual({ col: c, row: 9 });
		expect(readCell('A0')).toBeNull();
	});

	it('moves a token in its line and keeps the rest', () => {
		expect(moveToken(SRC, 1, { col: 3, row: 4 }).split('\n')[1]).toBe('Aria D5 blue');
		expect(moveToken(SRC, 2, { col: 0, row: 0 }).split('\n')[2]).toBe('[[Goblin]] 1 A1 red hidden');
		expect(moveToken(SRC, 3, { col: 26, row: 0 }).split('\n')[3]).toBe('Goblin 2 AA1');
		expect(moveToken(SRC, 1, null).split('\n')[1]).toBe('Aria blue');
		expect(moveToken('  Aria C4', 0, { col: 1, row: 1 })).toBe('  Aria B2');
	});

	it('adds tokens at the end', () => {
		expect(addTokens('8x8\nAria A1\n', 'Goblin 3 B2; Ogre')).toBe('8x8\nAria A1\nGoblin 3 B2\nOgre');
	});

	it('gives each token its initials', () => {
		expect(['Aria', 'Goblin 2', 'the Bugbear', '12', 'Élodie 10'].map(initials)).toEqual(['A', 'G2', 'T', '12', 'É10']);
	});

	it('sends the players no hidden tokens and none beside the map', () => {
		expect(mapForPlayers(parseMap(SRC), 'v1')).toEqual({
			image: 'v1',
			cols: 20,
			rows: 14,
			tokens: [
				{ name: 'Aria', col: 2, row: 3, color: 'blue' },
				{ name: 'Borin', col: 19, row: 13 },
			],
		});
	});
});

describe('fog of war', () => {
	const FOG = '![[Cellar.png]] 4x3\nfog\nreveal A1:B2 D3\nAria A1 blue\nGoblin D1 red\nOrc D3';

	it('reads the fog and the revealed squares, and skips them as tokens', () => {
		const m = parseMap(FOG);
		expect(m.fog).toBe(true);
		expect([...m.seen].sort((a, b) => a - b)).toEqual([0, 1, 4, 5, 11]);
		expect(m.tokens.map((t) => t.name)).toEqual(['Aria', 'Goblin', 'Orc']);
		expect(parseMap('4x3\nreveal A1').fog).toBe(false);
	});

	it('keeps tokens in the fog off the players\' phones and sends which squares show', () => {
		const p = mapForPlayers(parseMap(FOG), undefined);
		expect(p.tokens.map((t) => t.name)).toEqual(['Aria', 'Orc']);
		expect(p.fog).toBe('110011000001');
		expect(mapForPlayers(parseMap('4x3\nreveal A1\nGoblin D1'), undefined)).not.toHaveProperty('fog');
	});

	it('writes the revealed squares as few boxes as it takes', () => {
		expect(revealWords(new Set([0, 1, 4, 5, 11]), 4, 3)).toBe('A1:B2 D3');
		expect(revealWords(new Set(), 4, 3)).toBe('');
		expect(revealWords(new Set(box({ col: 3, row: 2 }, { col: 0, row: 0 }, 4)), 4, 3)).toBe('A1:D3');
	});

	it('puts fog under the picture line, rewrites reveal in place, and turns off without losing it', () => {
		const on = setSeen('![[Cellar.png]] 4x3\nAria A1', new Set([0]), 4, 3);
		expect(on).toBe('![[Cellar.png]] 4x3\nfog\nreveal A1\nAria A1');
		expect(setSeen(FOG, new Set([2, 3]), 4, 3)).toBe('![[Cellar.png]] 4x3\nfog\nreveal C1:D1\nAria A1 blue\nGoblin D1 red\nOrc D3');
		expect(setSeen('Aria A1\nreveal A1\nreveal B1', new Set(), 4, 3)).toBe('Aria A1\nfog');
		const off = fogOff(FOG);
		expect(parseMap(off).fog).toBe(false);
		expect(parseMap(setSeen(off, parseMap(off).seen, 4, 3)).seen.size).toBe(5);
		expect(fogString(parseMap(FOG))).toBe('110011000001');
	});
});
