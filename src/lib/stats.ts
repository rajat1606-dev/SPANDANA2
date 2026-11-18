/**
 * Small statistics helpers that approximate a ROC curve shape from a scalar
 * AUC (binormal model). Used only when the backend has not supplied the
 * measured curve points; the AUC itself is always a measured value.
 */

/** Abramowitz–Stegun 7.1.26 error function. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF. */
export function phi(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/** Beasley–Springer–Moro inverse standard normal CDF. */
export function inversePhi(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const pLow = 0.02425;
  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= 1 - pLow) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

export interface RocPoint {
  fpr: number;
  tpr: number;
}

/** Binormal ROC curve whose area equals `auc` (slope = 1). */
export function rocCurveFromAuc(auc: number, steps = 120): RocPoint[] {
  const dPrime = Math.SQRT2 * inversePhi(Math.min(0.9999, Math.max(0.0001, auc)));
  const points: RocPoint[] = [{ fpr: 0, tpr: 0 }];
  for (let i = steps; i >= 0; i--) {
    const z = -4 + (8 * i) / steps;
    const fpr = phi(-z);
    const tpr = phi(dPrime - z);
    if (fpr <= 0 || fpr >= 1) continue;
    points.push({
      fpr: Math.round(fpr * 1000) / 1000,
      tpr: Math.round(tpr * 1000) / 1000,
    });
  }
  points.push({ fpr: 1, tpr: 1 });
  return points;
}
