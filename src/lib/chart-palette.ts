/**
 * Chart palette — the single source of truth for every chart colour in the app.
 *
 * Previously each view hardcoded its own hexes, which drifted: Sokolow–Lyon was
 * #62a8e0 on the dashboard and #7fb3e3 on Model Comparison, and the dashboard
 * bar chart picked colours by array index, so a reordering of MODEL_METRICS
 * would have repainted the methods. Colour follows the entity here, never its
 * rank or its row number.
 *
 * The slots are the validated categorical order (blue, orange, aqua, yellow).
 * Do not substitute "nicer" hexes by eye — re-run the validator:
 *
 *   node scripts/validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100" --mode light
 *   node scripts/validate_palette.js "#3987e5,#d95926,#199e70,#c98500" --mode dark
 *
 * Recorded results (all checks pass in both modes):
 *   light — CVD ΔE 9.1 worst adjacent, normal-vision ΔE 22.9, lightness and
 *           chroma in band. Contrast WARN on aqua (2.74) and yellow (2.11):
 *           relief is supplied by the legend plus the metrics table on Model
 *           Comparison and the named counts beside the dashboard donut.
 *   dark  — CVD ΔE 8.4 worst adjacent, normal-vision ΔE 19.8, contrast clear.
 *
 * The previous palette failed: #1d6fbe ↔ #089fbf sat at normal-vision ΔE 13.8,
 * under the 15 floor, and #0b1728 fell outside the lightness band (0.203) and
 * below the chroma floor (0.038), so it read as black rather than as a hue.
 */

/** Categorical slots in fixed order. Never cycle; never generate a 5th. */
export const CHART_SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"],
  /** Same four hues stepped for a dark surface, not an automatic flip. */
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500"],
} as const;

/**
 * Model identity, keyed by the name the metrics carry. Shared by the dashboard
 * and Model Comparison so one method is one colour everywhere.
 * The key for Sokolow–Lyon uses an en dash, matching metrics.json.
 */
export const MODEL_COLORS: Record<string, string> = {
  "Sokolow–Lyon": CHART_SERIES.light[0],
  Cornell: CHART_SERIES.light[1],
  Perceptron: CHART_SERIES.light[2],
  CNN: CHART_SERIES.light[3],
};

/**
 * One hue for magnitude comparisons. A bar chart ranking a single measure
 * encodes its value in the bar length; colouring each bar differently would
 * double-encode that length as hue and spend the only free channel on
 * information the chart already shows.
 */
export const CHART_MAGNITUDE = CHART_SERIES.light[0];

/**
 * Workspace outcome slices. Each slice's name and count is printed beside the
 * chart, so identity never rests on colour alone.
 */
export const OUTCOME_COLORS = [
  CHART_SERIES.light[0],
  CHART_SERIES.light[1],
  CHART_SERIES.light[2],
];

/** Chart chrome: solid hairlines one shade off the surface, recessive ink. */
export const CHART_GRID = "#e6ecf4";
export const CHART_AXIS_LINE = "#dfe6ef";
export const CHART_AXIS_TEXT = "#5b6b7f";
export const CHART_LABEL_TEXT = "#0b1728";
