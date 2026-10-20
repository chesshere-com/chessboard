/*
 * SolidJS wrapper + chrome entry point. Pair with `assets/chrome.css`; the
 * board itself still needs `assets/chess-board.css` and `assets/piece-sets.css`.
 */

export { SolidChessBoard } from "./SolidChessBoard.tsx";
export type { SolidChessBoardProps } from "./SolidChessBoard.tsx";

export { NavControls } from "./NavControls.tsx";
export type { NavControlsLabels, NavControlsProps } from "./NavControls.tsx";

export { PlayerBar } from "./PlayerBar.tsx";
export type { ConnectionLevel, PlayerBarLabels, PlayerBarProps } from "./PlayerBar.tsx";

export { CapturedMaterial } from "./CapturedMaterial.tsx";
export type { CapturedMaterialProps } from "./CapturedMaterial.tsx";

export { Clock } from "./Clock.tsx";
export type { ClockLabels, ClockProps } from "./Clock.tsx";

export { capturedRow, leadingScore } from "./material-row.ts";
export type { CapturedEntry, CapturedRole } from "./material-row.ts";

export { formatClock } from "./clock-format.ts";
