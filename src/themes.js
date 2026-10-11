/** Semantic canvas palettes. The same tokens are used for preview and export. */
export const THEMES = Object.freeze({
  light: Object.freeze({
    name: "Light",
    background: "#fbfcf9",
    title: "#354033",
    text: "#475340",
    muted: "#7a856f",
    node: "#ffffff",
    nodeText: "#7b8772",
    activeText: "#3e483b",
    nodeBorder: "#d9dfd2",
    edge: "#a2af97",
    arrow: "#99a78d",
    edgeLabel: "#718062",
    divider: "#e2e7db",
    track: "#e6eadf",
    tint: "0d",
    accents: Object.freeze({
      lime: "#3e8f69",
      violet: "#7665b5",
      rose: "#c66e70",
      blue: "#4d82b9",
    }),
  }),
  dark: Object.freeze({
    name: "Dark",
    background: "#181c22",
    title: "#e7ebef",
    text: "#d5dce4",
    muted: "#9eabb8",
    node: "#252c35",
    nodeText: "#b6c1cd",
    activeText: "#edf1f5",
    nodeBorder: "#475460",
    edge: "#738391",
    arrow: "#899aa9",
    edgeLabel: "#aebbc8",
    divider: "#36414b",
    track: "#35414b",
    tint: "18",
    accents: Object.freeze({
      lime: "#8dc7a3",
      violet: "#b2a1e3",
      rose: "#df9696",
      blue: "#90b9dc",
    }),
  }),
  paper: Object.freeze({
    name: "Paper",
    background: "#f6f0e4",
    title: "#4c443b",
    text: "#5d5143",
    muted: "#87745e",
    node: "#fffaf0",
    nodeText: "#88745e",
    activeText: "#514534",
    nodeBorder: "#d1c3ad",
    edge: "#a4947c",
    arrow: "#948269",
    edgeLabel: "#7b654c",
    divider: "#ded1bb",
    track: "#ddd0b9",
    tint: "10",
    accents: Object.freeze({
      lime: "#63856b",
      violet: "#8b719e",
      rose: "#aa7057",
      blue: "#6c8d9c",
    }),
  }),
});
export function normalizeTheme(value) {
  return typeof value === "string" && ["light", "dark", "paper"].includes(value)
    ? value
    : "light";
}
export function getTheme(value) {
  return THEMES[normalizeTheme(value)];
}
