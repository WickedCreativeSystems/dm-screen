// The battle map's text side: reading a `battlemap` block and moving a token in it. No Obsidian here, so it is easy to
// test. A block looks like this:
//
//   ![[Cellar.png]] 20x14       the picture and the grid, columns by rows (the picture is optional)
//   Aria C4 blue                a token: a name, a cell (column letter, row number) and an optional colour
//   Goblin 1 F7 red hidden      `hidden` keeps it off the players' phones until you take the word out
//   Goblin 2                    no cell yet: it waits beside the map until it is dragged on
//   fog                         fog of war: the players see only the squares revealed
//   reveal A1:D4 F2             the squares revealed, as corners of boxes or single squares

export const COLORS = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink'] as const;
export type Color = (typeof COLORS)[number];

export const MAX_SIDE = 60;
export const MAX_TOKENS = 60;
const DEFAULT_SIDE = 10;

export interface Token {
	name: string; // what is shown, without [[ ]]
	link?: string;
	col?: number; // 0-based; none while it waits beside the map
	row?: number;
	color?: Color;
	hidden: boolean;
	index: number; // its line in the block
}

export interface BattleMap {
	image: string | null; // the picture's path as written in the embed
	cols: number;
	rows: number;
	tokens: Token[];
	fog: boolean;
	seen: Set<number>; // revealed squares, as row * cols + col
}

const EMBED = /!\[\[([^\]|#]+)[^\]]*\]\]|!\[[^\]]*\]\((?:<([^>]+)>|([^)\s]+))[^)]*\)/;
const GRID = /(?:^|\s)(?:grid\s+)?(\d{1,2})\s*[x×]\s*(\d{1,2})(?:\s|$)/i;
const CELL = /^([A-Za-z]{1,2})(\d{1,2})$/;
const FOG = /^fog$/i;
const REVEAL = /^reveal(?:\s+(.*))?$/i;
const RANGE = /^([A-Za-z]{1,2}\d{1,2})(?:[:-]([A-Za-z]{1,2}\d{1,2}))?$/;
const LINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/;

/** A column's letters: A to Z, then AA, AB and on. */
export function colName(col: number): string {
	const letter = (n: number) => String.fromCharCode(65 + n);
	return col < 26 ? letter(col) : letter(Math.floor(col / 26) - 1) + letter(col % 26);
}

/** "C4" as column 2, row 3. */
export function readCell(word: string): { col: number; row: number } | null {
	const m = CELL.exec(word);
	if (!m) return null;
	const l = m[1]!.toUpperCase();
	const col = l.length === 1 ? l.charCodeAt(0) - 65 : (l.charCodeAt(0) - 64) * 26 + l.charCodeAt(1) - 65;
	const row = Number(m[2]) - 1;
	return row >= 0 ? { col, row } : null;
}

export const cellName = (col: number, row: number) => `${colName(col)}${row + 1}`;

/** A token's line split into its parts: the name, the cell word's place, and the colour and `hidden` at the end. */
function readToken(line: string) {
	const words = line.trim().split(/\s+/);
	let color: Color | undefined;
	let hidden = false;
	let end = words.length;
	// the tail: a colour and `hidden`, in either order
	while (end > 1) {
		const w = words[end - 1]!.toLowerCase();
		if (!color && (COLORS as readonly string[]).includes(w)) color = w as Color;
		else if (!hidden && w === 'hidden') hidden = true;
		else break;
		end--;
	}
	const cell = end > 1 ? readCell(words[end - 1]!) : null;
	const nameWords = words.slice(0, cell ? end - 1 : end);
	return { nameWords, cell, color, hidden };
}

function named(text: string): { name: string; link?: string } {
	const l = LINK.exec(text);
	if (!l) return { name: text.trim() };
	return { name: text.replace(l[0], l[2]?.trim() ?? l[1]!.trim()).replace(/\s+/g, ' ').trim(), link: l[1]!.trim() };
}

export function parseMap(src: string): BattleMap {
	const map: BattleMap = { image: null, cols: DEFAULT_SIDE, rows: DEFAULT_SIDE, tokens: [], fog: false, seen: new Set() };
	let gridSeen = false;
	const boxes: { a: { col: number; row: number }; b: { col: number; row: number } }[] = [];
	src.split('\n').forEach((raw, index) => {
		let line = raw.trim();
		if (!line || line.startsWith('#') || line.startsWith('%%')) return;
		const e = EMBED.exec(line);
		if (e) {
			if (map.image === null) map.image = (e[1] ?? decodeURIComponent(e[2] ?? e[3] ?? '')).trim();
			line = line.replace(e[0], ' ').trim();
		}
		const g = !gridSeen ? GRID.exec(` ${line} `) : null;
		if (g && (e || /^(grid\s+)?\d{1,2}\s*[x×]\s*\d{1,2}$/i.test(line))) {
			gridSeen = true;
			map.cols = Math.min(MAX_SIDE, Math.max(1, Number(g[1])));
			map.rows = Math.min(MAX_SIDE, Math.max(1, Number(g[2])));
			return;
		}
		if (!e && FOG.test(line)) {
			map.fog = true;
			return;
		}
		const rv = !e ? REVEAL.exec(line) : null;
		if (rv) {
			for (const w of (rv[1] ?? '').split(/[\s,]+/)) {
				const m = RANGE.exec(w);
				const a = m && readCell(m[1]!);
				const b = m && (m[2] ? readCell(m[2]) : a);
				if (a && b) boxes.push({ a, b });
			}
			return;
		}
		if (e || map.tokens.length >= MAX_TOKENS) return;
		const t = readToken(line);
		const { name, link } = named(t.nameWords.join(' '));
		if (!name) return;
		const token: Token = { name, hidden: t.hidden, index };
		if (link) token.link = link;
		if (t.color) token.color = t.color;
		if (t.cell) {
			token.col = t.cell.col;
			token.row = t.cell.row;
		}
		map.tokens.push(token);
	});
	for (const { a, b } of boxes) {
		for (let r = Math.min(a.row, b.row); r <= Math.min(map.rows - 1, Math.max(a.row, b.row)); r++)
			for (let c = Math.min(a.col, b.col); c <= Math.min(map.cols - 1, Math.max(a.col, b.col)); c++) map.seen.add(r * map.cols + c);
	}
	// a token off the grid (the grid shrank) waits beside the map
	for (const t of map.tokens) {
		if (t.col !== undefined && (t.col >= map.cols || t.row! >= map.rows)) {
			delete t.col;
			delete t.row;
		}
	}
	return map;
}

/** Writes a token's new cell into its line, or takes the cell out (`at` null) to set it beside the map. */
export function moveToken(src: string, index: number, at: { col: number; row: number } | null): string {
	const lines = src.split('\n');
	const line = lines[index];
	if (line === undefined) return src;
	const lead = /^\s*/.exec(line)![0];
	const words = line.trim().split(/\s+/);
	const t = readToken(line);
	const tail = words.slice(t.nameWords.length + (t.cell ? 1 : 0));
	const cell = at ? [cellName(at.col, at.row)] : [];
	lines[index] = lead + [...t.nameWords, ...cell, ...tail].join(' ');
	return lines.join('\n');
}

/** Adds tokens typed in the add box, one per line (or split by ;), at the end of the block. */
export function addTokens(src: string, text: string): string {
	const add = text.split(/\n|;/).map((s) => s.trim()).filter(Boolean);
	if (!add.length) return src;
	const body = src.replace(/\s+$/, '');
	return (body ? body + '\n' : '') + add.join('\n');
}

/** What a token shows on its disc: the first letter, and a number at the end of its name ("Goblin 2" is G2). */
export function initials(name: string): string {
	const n = /(\d+)$/.exec(name.trim())?.[1] ?? '';
	const first = /\p{L}/u.exec(name)?.[0]?.toUpperCase();
	return first ? first + n : n || '?';
}

/** The revealed squares as few boxes as it takes, row by row: `A1:D4 F2`. */
export function revealWords(seen: Set<number>, cols: number, rows: number): string {
	const used = new Set<number>();
	const out: string[] = [];
	const open = (c: number, r: number) => seen.has(r * cols + c) && !used.has(r * cols + c);
	for (let r = 0; r < rows; r++)
		for (let c = 0; c < cols; c++) {
			if (!open(c, r)) continue;
			let w = 1;
			while (c + w < cols && open(c + w, r)) w++;
			let h = 1;
			while (r + h < rows && Array.from({ length: w }, (_, i) => open(c + i, r + h)).every(Boolean)) h++;
			for (let y = r; y < r + h; y++) for (let x = c; x < c + w; x++) used.add(y * cols + x);
			out.push(w === 1 && h === 1 ? cellName(c, r) : `${cellName(c, r)}:${cellName(c + w - 1, r + h - 1)}`);
		}
	return out.join(' ');
}

const isFogLine = (l: string) => FOG.test(l.trim()) || REVEAL.test(l.trim());

/** Writes the revealed squares into the block as one `reveal` line under `fog` (which it adds if it isn't there). */
export function setSeen(src: string, seen: Set<number>, cols: number, rows: number): string {
	const lines = src.split('\n');
	const at = lines.findIndex((l) => isFogLine(l));
	const lead = at >= 0 ? /^\s*/.exec(lines[at]!)![0] : '';
	const words = revealWords(seen, cols, rows);
	const fog = [lead + 'fog', ...(words ? [lead + 'reveal ' + words] : [])];
	const rest = lines.filter((l) => !isFogLine(l));
	if (at >= 0) {
		const before = lines.slice(0, at).filter((l) => !isFogLine(l)).length;
		rest.splice(before, 0, ...fog);
		return rest.join('\n');
	}
	// a new fog goes under the picture and grid line, if the block starts with one
	const first = rest.findIndex((l) => l.trim() && !l.trim().startsWith('#') && !l.trim().startsWith('%%'));
	const head = first >= 0 && (EMBED.test(rest[first]!) || /^(grid\s+)?\d{1,2}\s*[x×]\s*\d{1,2}$/i.test(rest[first]!.trim())) ? first + 1 : 0;
	rest.splice(head, 0, ...fog);
	return rest.join('\n');
}

/** Turns fog of war off: the `fog` line goes, and the `reveal` line stays for when it comes back. */
export function fogOff(src: string): string {
	return src.split('\n').filter((l) => !FOG.test(l.trim())).join('\n');
}

/** The cells in the box between two squares. */
export function box(a: { col: number; row: number }, b: { col: number; row: number }, cols: number): number[] {
	const out: number[] = [];
	for (let r = Math.min(a.row, b.row); r <= Math.max(a.row, b.row); r++)
		for (let c = Math.min(a.col, b.col); c <= Math.max(a.col, b.col); c++) out.push(r * cols + c);
	return out;
}

/** The fog as the players' phones get it: one character a square, row by row, 1 where it is revealed. */
export function fogString(map: BattleMap): string {
	let s = '';
	for (let i = 0; i < map.cols * map.rows; i++) s += map.seen.has(i) ? '1' : '0';
	return s;
}

/** What the players' phones are sent of a map: no hidden tokens, no tokens off the grid or in the fog, no links. */
export function mapForPlayers(map: BattleMap, image: string | undefined) {
	const out: { image?: string; cols: number; rows: number; fog?: string; tokens: { name: string; col: number; row: number; color?: Color }[] } = {
		cols: map.cols,
		rows: map.rows,
		tokens: map.tokens
			.filter((t) => !t.hidden && t.col !== undefined && (!map.fog || map.seen.has(t.row! * map.cols + t.col)))
			.map((t) => (t.color ? { name: t.name, col: t.col!, row: t.row!, color: t.color } : { name: t.name, col: t.col!, row: t.row! })),
	};
	if (image) out.image = image;
	if (map.fog) out.fog = fogString(map);
	return out;
}
