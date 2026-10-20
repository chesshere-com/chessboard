import type { Color, Piece, Role } from '../src/types.ts';

export type PieceAssetResolver = (piece: Piece) => string;

const roles: Record<Role, string> = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' };

/** Base URL points directly at a set directory containing wP.svg, bN.svg, etc. */
export function pieceAssetVariables(source: string | PieceAssetResolver): Record<string, string> {
  const resolve = typeof source === 'function' ? source : ({ color, role }: Piece) =>
    `${source.replace(/\/$/, '')}/${color === 'white' ? 'w' : 'b'}${roles[role]}.svg`;
  const variables: Record<string, string> = {};
  for (const color of ['white', 'black'] as Color[]) {
    for (const role of Object.keys(roles) as Role[]) {
      const url = resolve({ color, role });
      // CSS strings require escaping even when an asset resolver returns a valid URL.
      const escaped = url.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]/g, ch => `\\${ch.charCodeAt(0).toString(16)} `);
      variables[`--cb-piece-${color}-${role}`] = `url("${escaped}")`;
    }
  }
  return variables;
}

export function setPieceAssets(host: HTMLElement, source: string | PieceAssetResolver): void {
  for (const [name, value] of Object.entries(pieceAssetVariables(source))) host.style.setProperty(name, value);
}
