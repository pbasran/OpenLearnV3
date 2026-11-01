// IEC 61217 conventions used by the linac model.
//   Fixed axes   : origin = isocentre; +Y toward the gantry, +Z up, +X to the right when facing the gantry from the foot of the couch.
//   Gantry       : 0-360 deg, increases clockwise seen from the foot of the couch facing the gantry; 90 deg = source on the patient's left (HFS).
//   Collimator   : 0-360 deg, increases counter-clockwise seen from the source (beam's-eye view); jaw axes X (X1,X2) and Y (Y1,Y2) at 0 deg.
//   Couch top    : eccentric rotation about +Z, increases counter-clockwise seen from above; lateral +X, longitudinal +Y (toward the gantry = IN), vertical +Z (up).
//   Jaws/leaves  : signed coordinates at the isocentre plane in the beam-limiting-device system (X1, Y1 negative side; X2, Y2 positive side).
/** Angle on the IEC 0-360 scale (the model stores -180..180 internally). */
export const a360 = (v) => ((v % 360) + 360) % 360;
/** Fixed-decimal IEC 0-360 angle string (359.96 rounds to 0.0, never 360.0). */
export const f360 = (v, d = 1) => { const k = 10 ** d, r = Math.round(v * k) / k; return (((r % 360) + 360) % 360).toFixed(d); };
/** Signed fixed-decimal for jaw coordinates (+5.0, -3.0). */
export const fs = (v, d = 1) => { const r = Math.abs(v) < 0.5 * 10 ** -d ? 0 : v; return (r > 0 ? '+' : '') + r.toFixed(d); };
