import assert from 'node:assert/strict';
import test from 'node:test';
import { pieceAssetVariables, setPieceAssets } from '../adapters/piece-assets.ts';

test('custom asset base configures all twelve pieces without site-root assumptions', () => {
    const variables = pieceAssetVariables('https://cdn.example/chess/custom/');
    assert.equal(Object.keys(variables).length, 12);
    assert.equal(variables['--cb-piece-white-knight'], 'url("https://cdn.example/chess/custom/wN.svg")');
    assert.equal(variables['--cb-piece-black-king'], 'url("https://cdn.example/chess/custom/bK.svg")');
});

test('asset resolver supports arbitrary naming and safely quotes CSS strings', () => {
    const values = new Map();
    setPieceAssets({ style: { setProperty: (key, value) => values.set(key, value) } }, ({ color, role }) => `/pieces/${color}/${role}"\\\n.png`);
    assert.equal(values.get('--cb-piece-white-pawn'), 'url("/pieces/white/pawn\\"\\\\\\a .png")');
});
