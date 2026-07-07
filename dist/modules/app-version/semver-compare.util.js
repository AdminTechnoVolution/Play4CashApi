"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareSemver = compareSemver;
function compareSemver(a, b) {
    const parse = (s) => String(s)
        .split('+')[0]
        .split('.')
        .map((p) => {
        const n = parseInt(p, 10);
        return Number.isFinite(n) ? n : 0;
    });
    const av = parse(a);
    const bv = parse(b);
    const len = Math.max(av.length, bv.length);
    for (let i = 0; i < len; i++) {
        const diff = (av[i] ?? 0) - (bv[i] ?? 0);
        if (diff !== 0)
            return diff;
    }
    return 0;
}
//# sourceMappingURL=semver-compare.util.js.map