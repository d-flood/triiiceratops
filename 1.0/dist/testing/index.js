var Js = Object.defineProperty;
var ei = Object.getPrototypeOf;
var ti = Reflect.get;
var Bn = (n) => {
  throw TypeError(n);
};
var ni = (n, e, t) => e in n ? Js(n, e, { enumerable: !0, configurable: !0, writable: !0, value: t }) : n[e] = t;
var _ = (n, e, t) => ni(n, typeof e != "symbol" ? e + "" : e, t), un = (n, e, t) => e.has(n) || Bn("Cannot " + t);
var c = (n, e, t) => (un(n, e, "read from private field"), t ? t.call(n) : e.get(n)), d = (n, e, t) => e.has(n) ? Bn("Cannot add the same private member more than once") : e instanceof WeakSet ? e.add(n) : e.set(n, t), O = (n, e, t, s) => (un(n, e, "write to private field"), s ? s.call(n, t) : e.set(n, t), t), C = (n, e, t) => (un(n, e, "access private method"), t);
var Nn = (n, e, t) => ti(ei(n), t, e);
import { logger as mn, isDebugEnabled as qn } from "../logging/logger.js";
import { attachSelectorRuntime as si, detachSelectorRuntime as ii } from "../framework/runtimeRegistry.js";
const yn = !1;
var ri = Array.isArray, ai = Array.prototype.indexOf, fn = Object.getOwnPropertyDescriptor, oi = Object.prototype, li = Array.prototype, ci = Object.getPrototypeOf;
function ui(n) {
  for (var e = 0; e < n.length; e++)
    n[e]();
}
function fi() {
  var n, e, t = new Promise((s, i) => {
    n = s, e = i;
  });
  return { promise: t, resolve: n, reject: e };
}
const k = 2, os = 4, hi = 1 << 24, we = 16, Oe = 32, Se = 64, Tn = 128, Y = 512, L = 1024, $ = 2048, ne = 4096, _e = 8192, pe = 16384, kn = 32768, zn = 65536, $n = 1 << 17, ls = 1 << 18, cs = 1 << 19, di = 1 << 20, be = 32768, bn = 1 << 21, us = 1 << 22, Be = 1 << 23, hn = Symbol("$state"), fs = new class extends Error {
  constructor() {
    super(...arguments);
    _(this, "name", "StaleReactionError");
    _(this, "message", "The reaction that called `getAbortSignal()` was re-run or destroyed");
  }
}();
function gi(n) {
  throw new Error("https://svelte.dev/e/effect_in_teardown");
}
function vi() {
  throw new Error("https://svelte.dev/e/effect_in_unowned_derived");
}
function pi(n) {
  throw new Error("https://svelte.dev/e/effect_orphan");
}
function mi() {
  throw new Error("https://svelte.dev/e/effect_update_depth_exceeded");
}
function yi() {
  throw new Error("https://svelte.dev/e/state_descriptors_fixed");
}
function bi() {
  throw new Error("https://svelte.dev/e/state_prototype_fixed");
}
function wi() {
  throw new Error("https://svelte.dev/e/state_unsafe_mutation");
}
const D = Symbol();
function Si(n) {
  return n === this.v;
}
let Ci = !1, an = null;
function jn(n) {
  an = n;
}
function hs() {
  return !0;
}
let fe = [];
function ds() {
  var n = fe;
  fe = [], ui(n);
}
function _i(n) {
  if (fe.length === 0 && !Ge) {
    var e = fe;
    queueMicrotask(() => {
      e === fe && ds();
    });
  }
  fe.push(n);
}
function Ai() {
  for (; fe.length > 0; )
    ds();
}
function Ii(n) {
  var e = M;
  if (e === null)
    return w.f |= Be, n;
  if ((e.f & kn) === 0) {
    if ((e.f & Tn) === 0)
      throw n;
    e.b.error(n);
  } else
    gs(n, e);
}
function gs(n, e) {
  for (; e !== null; ) {
    if ((e.f & Tn) !== 0)
      try {
        e.b.error(n);
        return;
      } catch (t) {
        n = t;
      }
    e = e.parent;
  }
  throw n;
}
const zt = /* @__PURE__ */ new Set();
let S = null, A = null, z = [], on = null, wn = !1, Ge = !1;
var Ie, Pe, he, de, $e, Ee, Me, I, Sn, ce, Cn, vs, ps;
const en = class en {
  constructor() {
    d(this, I);
    _(this, "committed", !1);
    /**
     * The current values of any sources that are updated in this batch
     * They keys of this map are identical to `this.#previous`
     * @type {Map<Source, any>}
     */
    _(this, "current", /* @__PURE__ */ new Map());
    /**
     * The values of any sources that are updated in this batch _before_ those updates took place.
     * They keys of this map are identical to `this.#current`
     * @type {Map<Source, any>}
     */
    _(this, "previous", /* @__PURE__ */ new Map());
    /**
     * When the batch is committed (and the DOM is updated), we need to remove old branches
     * and append new ones by calling the functions added inside (if/each/key/etc) blocks
     * @type {Set<() => void>}
     */
    d(this, Ie, /* @__PURE__ */ new Set());
    /**
     * If a fork is discarded, we need to destroy any effects that are no longer needed
     * @type {Set<(batch: Batch) => void>}
     */
    d(this, Pe, /* @__PURE__ */ new Set());
    /**
     * The number of async effects that are currently in flight
     */
    d(this, he, 0);
    /**
     * The number of async effects that are currently in flight, _not_ inside a pending boundary
     */
    d(this, de, 0);
    /**
     * A deferred that resolves when the batch is committed, used with `settled()`
     * TODO replace with Promise.withResolvers once supported widely enough
     * @type {{ promise: Promise<void>, resolve: (value?: any) => void, reject: (reason: unknown) => void } | null}
     */
    d(this, $e, null);
    /**
     * Deferred effects (which run after async work has completed) that are DIRTY
     * @type {Effect[]}
     */
    d(this, Ee, []);
    /**
     * Deferred effects that are MAYBE_DIRTY
     * @type {Effect[]}
     */
    d(this, Me, []);
    /**
     * A set of branches that still exist, but will be destroyed when this batch
     * is committed — we skip over these during `process`
     * @type {Set<Effect>}
     */
    _(this, "skipped_effects", /* @__PURE__ */ new Set());
    _(this, "is_fork", !1);
  }
  is_deferred() {
    return this.is_fork || c(this, de) > 0;
  }
  /**
   *
   * @param {Effect[]} root_effects
   */
  process(e) {
    var s;
    z = [], this.apply();
    var t = {
      parent: null,
      effect: null,
      effects: [],
      render_effects: [],
      block_effects: []
    };
    for (const i of e)
      C(this, I, Sn).call(this, i, t);
    this.is_fork || C(this, I, vs).call(this), this.is_deferred() ? (C(this, I, ce).call(this, t.effects), C(this, I, ce).call(this, t.render_effects), C(this, I, ce).call(this, t.block_effects)) : (S = null, Hn(t.render_effects), Hn(t.effects), (s = c(this, $e)) == null || s.resolve()), A = null;
  }
  /**
   * Associate a change to a given source with the current
   * batch, noting its previous and current values
   * @param {Source} source
   * @param {any} value
   */
  capture(e, t) {
    this.previous.has(e) || this.previous.set(e, t), (e.f & Be) === 0 && (this.current.set(e, e.v), A == null || A.set(e, e.v));
  }
  activate() {
    S = this, this.apply();
  }
  deactivate() {
    S === this && (S = null, A = null);
  }
  flush() {
    if (this.activate(), z.length > 0) {
      if (ys(), S !== null && S !== this)
        return;
    } else c(this, he) === 0 && this.process([]);
    this.deactivate();
  }
  discard() {
    for (const e of c(this, Pe)) e(this);
    c(this, Pe).clear();
  }
  /**
   *
   * @param {boolean} blocking
   */
  increment(e) {
    O(this, he, c(this, he) + 1), e && O(this, de, c(this, de) + 1);
  }
  /**
   *
   * @param {boolean} blocking
   */
  decrement(e) {
    O(this, he, c(this, he) - 1), e && O(this, de, c(this, de) - 1), this.revive();
  }
  revive() {
    for (const e of c(this, Ee))
      V(e, $), Re(e);
    for (const e of c(this, Me))
      V(e, ne), Re(e);
    O(this, Ee, []), O(this, Me, []), this.flush();
  }
  /** @param {() => void} fn */
  oncommit(e) {
    c(this, Ie).add(e);
  }
  /** @param {(batch: Batch) => void} fn */
  ondiscard(e) {
    c(this, Pe).add(e);
  }
  settled() {
    return (c(this, $e) ?? O(this, $e, fi())).promise;
  }
  static ensure() {
    if (S === null) {
      const e = S = new en();
      zt.add(S), Ge || en.enqueue(() => {
        S === e && e.flush();
      });
    }
    return S;
  }
  /** @param {() => void} task */
  static enqueue(e) {
    _i(e);
  }
  apply() {
  }
};
Ie = new WeakMap(), Pe = new WeakMap(), he = new WeakMap(), de = new WeakMap(), $e = new WeakMap(), Ee = new WeakMap(), Me = new WeakMap(), I = new WeakSet(), /**
 * Traverse the effect tree, executing effects or stashing
 * them for later execution as appropriate
 * @param {Effect} root
 * @param {EffectTarget} target
 */
Sn = function(e, t) {
  var f;
  e.f ^= L;
  for (var s = e.first; s !== null; ) {
    var i = s.f, r = (i & (Oe | Se)) !== 0, a = r && (i & L) !== 0, l = a || (i & _e) !== 0 || this.skipped_effects.has(s);
    if ((s.f & Tn) !== 0 && ((f = s.b) != null && f.is_pending()) && (t = {
      parent: t,
      effect: s,
      effects: [],
      render_effects: [],
      block_effects: []
    }), !l && s.fn !== null) {
      r ? s.f ^= L : (i & os) !== 0 ? t.effects.push(s) : qt(s) && ((s.f & we) !== 0 && t.block_effects.push(s), ze(s));
      var o = s.first;
      if (o !== null) {
        s = o;
        continue;
      }
    }
    var u = s.parent;
    for (s = s.next; s === null && u !== null; )
      u === t.effect && (C(this, I, ce).call(this, t.effects), C(this, I, ce).call(this, t.render_effects), C(this, I, ce).call(this, t.block_effects), t = /** @type {EffectTarget} */
      t.parent), s = u.next, u = u.parent;
  }
}, /**
 * @param {Effect[]} effects
 */
ce = function(e) {
  for (const t of e)
    ((t.f & $) !== 0 ? c(this, Ee) : c(this, Me)).push(t), C(this, I, Cn).call(this, t.deps), V(t, L);
}, /**
 * @param {Value[] | null} deps
 */
Cn = function(e) {
  if (e !== null)
    for (const t of e)
      (t.f & k) === 0 || (t.f & be) === 0 || (t.f ^= be, C(this, I, Cn).call(
        this,
        /** @type {Derived} */
        t.deps
      ));
}, vs = function() {
  if (c(this, de) === 0) {
    for (const e of c(this, Ie)) e();
    c(this, Ie).clear();
  }
  c(this, he) === 0 && C(this, I, ps).call(this);
}, ps = function() {
  var r;
  if (zt.size > 1) {
    this.previous.clear();
    var e = A, t = !0, s = {
      parent: null,
      effect: null,
      effects: [],
      render_effects: [],
      block_effects: []
    };
    for (const a of zt) {
      if (a === this) {
        t = !1;
        continue;
      }
      const l = [];
      for (const [u, f] of this.current) {
        if (a.current.has(u))
          if (t && f !== a.current.get(u))
            a.current.set(u, f);
          else
            continue;
        l.push(u);
      }
      if (l.length === 0)
        continue;
      const o = [...a.current.keys()].filter((u) => !this.current.has(u));
      if (o.length > 0) {
        var i = z;
        z = [];
        const u = /* @__PURE__ */ new Set(), f = /* @__PURE__ */ new Map();
        for (const h of l)
          bs(h, o, u, f);
        if (z.length > 0) {
          S = a, a.apply();
          for (const h of z)
            C(r = a, I, Sn).call(r, h, s);
          a.deactivate();
        }
        z = i;
      }
    }
    S = null, A = e;
  }
  this.committed = !0, zt.delete(this);
};
let Ne = en;
function ms(n) {
  var e = Ge;
  Ge = !0;
  try {
    for (var t; ; ) {
      if (Ai(), z.length === 0 && (S == null || S.flush(), z.length === 0))
        return on = null, /** @type {T} */
        t;
      ys();
    }
  } finally {
    Ge = e;
  }
}
function ys() {
  var n = me;
  wn = !0;
  var e = null;
  try {
    var t = 0;
    for (Yt(!0); z.length > 0; ) {
      var s = Ne.ensure();
      if (t++ > 1e3) {
        var i, r;
        Pi();
      }
      s.process(z), oe.clear();
    }
  } finally {
    wn = !1, Yt(n), on = null;
  }
}
function Pi() {
  try {
    mi();
  } catch (n) {
    gs(n, on);
  }
}
let j = null;
function Hn(n) {
  var e = n.length;
  if (e !== 0) {
    for (var t = 0; t < e; ) {
      var s = n[t++];
      if ((s.f & (pe | _e)) === 0 && qt(s) && (j = /* @__PURE__ */ new Set(), ze(s), s.deps === null && s.first === null && s.nodes === null && (s.teardown === null && s.ac === null ? xs(s) : s.fn = null), (j == null ? void 0 : j.size) > 0)) {
        oe.clear();
        for (const i of j) {
          if ((i.f & (pe | _e)) !== 0) continue;
          const r = [i];
          let a = i.parent;
          for (; a !== null; )
            j.has(a) && (j.delete(a), r.push(a)), a = a.parent;
          for (let l = r.length - 1; l >= 0; l--) {
            const o = r[l];
            (o.f & (pe | _e)) === 0 && ze(o);
          }
        }
        j.clear();
      }
    }
    j = null;
  }
}
function bs(n, e, t, s) {
  if (!t.has(n) && (t.add(n), n.reactions !== null))
    for (const i of n.reactions) {
      const r = i.f;
      (r & k) !== 0 ? bs(
        /** @type {Derived} */
        i,
        e,
        t,
        s
      ) : (r & (us | we)) !== 0 && (r & $) === 0 && ws(i, e, s) && (V(i, $), Re(
        /** @type {Effect} */
        i
      ));
    }
}
function ws(n, e, t) {
  const s = t.get(n);
  if (s !== void 0) return s;
  if (n.deps !== null)
    for (const i of n.deps) {
      if (e.includes(i))
        return !0;
      if ((i.f & k) !== 0 && ws(
        /** @type {Derived} */
        i,
        e,
        t
      ))
        return t.set(
          /** @type {Derived} */
          i,
          !0
        ), !0;
    }
  return t.set(n, !1), !1;
}
function Re(n) {
  for (var e = on = n; e.parent !== null; ) {
    e = e.parent;
    var t = e.f;
    if (wn && e === M && (t & we) !== 0 && (t & ls) === 0)
      return;
    if ((t & (Se | Oe)) !== 0) {
      if ((t & L) === 0) return;
      e.f ^= L;
    }
  }
  z.push(e);
}
function Ss(n) {
  var e = n.effects;
  if (e !== null) {
    n.effects = null;
    for (var t = 0; t < e.length; t += 1)
      Nt(
        /** @type {Effect} */
        e[t]
      );
  }
}
function Ei(n) {
  for (var e = n.parent; e !== null; ) {
    if ((e.f & k) === 0)
      return (e.f & pe) === 0 ? (
        /** @type {Effect} */
        e
      ) : null;
    e = e.parent;
  }
  return null;
}
function On(n) {
  var e, t = M;
  Xt(Ei(n));
  try {
    n.f &= ~be, Ss(n), e = Os(n);
  } finally {
    Xt(t);
  }
  return e;
}
function Cs(n) {
  var e = On(n);
  if (n.equals(e) || (S != null && S.is_fork || (n.v = e), n.wv = Ts()), !De)
    if (A !== null)
      (Kt() || S != null && S.is_fork) && A.set(n, e);
    else {
      var t = (n.f & Y) === 0 ? ne : L;
      V(n, t);
    }
}
let _n = /* @__PURE__ */ new Set();
const oe = /* @__PURE__ */ new Map();
let _s = !1;
function Dn(n, e) {
  var t = {
    f: 0,
    // TODO ideally we could skip this altogether, but it causes type errors
    v: n,
    reactions: null,
    equals: Si,
    rv: 0,
    wv: 0
  };
  return t;
}
// @__NO_SIDE_EFFECTS__
function p(n, e) {
  const t = Dn(n);
  return Gi(t), t;
}
function v(n, e, t = !1) {
  w !== null && // since we are untracking the function inside `$inspect.with` we need to add this check
  // to ensure we error if state is set inside an inspect effect
  (!ee || (w.f & $n) !== 0) && hs() && (w.f & (k | we | us | $n)) !== 0 && !(T != null && T.includes(n)) && wi();
  let s = t ? P(e) : e;
  return Mi(n, s);
}
function Mi(n, e) {
  if (!n.equals(e)) {
    var t = n.v;
    De ? oe.set(n, e) : oe.set(n, t), n.v = e;
    var s = Ne.ensure();
    s.capture(n, t), (n.f & k) !== 0 && ((n.f & $) !== 0 && On(
      /** @type {Derived} */
      n
    ), V(n, (n.f & Y) !== 0 ? L : ne)), n.wv = Ts(), As(n, $), M !== null && (M.f & L) !== 0 && (M.f & (Oe | Se)) === 0 && (q === null ? Bi([n]) : q.push(n)), !s.is_fork && _n.size > 0 && !_s && xi();
  }
  return e;
}
function xi() {
  _s = !1;
  var n = me;
  Yt(!0);
  const e = Array.from(_n);
  try {
    for (const t of e)
      (t.f & L) !== 0 && V(t, ne), qt(t) && ze(t);
  } finally {
    Yt(n);
  }
  _n.clear();
}
function W(n) {
  v(n, n.v + 1);
}
function As(n, e) {
  var t = n.reactions;
  if (t !== null)
    for (var s = t.length, i = 0; i < s; i++) {
      var r = t[i], a = r.f, l = (a & $) === 0;
      if (l && V(r, e), (a & k) !== 0) {
        var o = (
          /** @type {Derived} */
          r
        );
        A == null || A.delete(o), (a & be) === 0 && (a & Y && (r.f |= be), As(o, ne));
      } else l && ((a & we) !== 0 && j !== null && j.add(
        /** @type {Effect} */
        r
      ), Re(
        /** @type {Effect} */
        r
      ));
    }
}
function P(n) {
  if (typeof n != "object" || n === null || hn in n)
    return n;
  const e = ci(n);
  if (e !== oi && e !== li)
    return n;
  var t = /* @__PURE__ */ new Map(), s = ri(n), i = /* @__PURE__ */ p(0), r = K, a = (l) => {
    if (K === r)
      return l();
    var o = w, u = K;
    Te(null), Qn(r);
    var f = l();
    return Te(o), Qn(u), f;
  };
  return s && t.set("length", /* @__PURE__ */ p(
    /** @type {any[]} */
    n.length
  )), new Proxy(
    /** @type {any} */
    n,
    {
      defineProperty(l, o, u) {
        (!("value" in u) || u.configurable === !1 || u.enumerable === !1 || u.writable === !1) && yi();
        var f = t.get(o);
        return f === void 0 ? f = a(() => {
          var h = /* @__PURE__ */ p(u.value);
          return t.set(o, h), h;
        }) : v(f, u.value, !0), !0;
      },
      deleteProperty(l, o) {
        var u = t.get(o);
        if (u === void 0) {
          if (o in l) {
            const f = a(() => /* @__PURE__ */ p(D));
            t.set(o, f), W(i);
          }
        } else
          v(u, D), W(i);
        return !0;
      },
      get(l, o, u) {
        var m;
        if (o === hn)
          return n;
        var f = t.get(o), h = o in l;
        if (f === void 0 && (!h || (m = fn(l, o)) != null && m.writable) && (f = a(() => {
          var b = P(h ? l[o] : D), x = /* @__PURE__ */ p(b);
          return x;
        }), t.set(o, f)), f !== void 0) {
          var y = g(f);
          return y === D ? void 0 : y;
        }
        return Reflect.get(l, o, u);
      },
      getOwnPropertyDescriptor(l, o) {
        var u = Reflect.getOwnPropertyDescriptor(l, o);
        if (u && "value" in u) {
          var f = t.get(o);
          f && (u.value = g(f));
        } else if (u === void 0) {
          var h = t.get(o), y = h == null ? void 0 : h.v;
          if (h !== void 0 && y !== D)
            return {
              enumerable: !0,
              configurable: !0,
              value: y,
              writable: !0
            };
        }
        return u;
      },
      has(l, o) {
        var y;
        if (o === hn)
          return !0;
        var u = t.get(o), f = u !== void 0 && u.v !== D || Reflect.has(l, o);
        if (u !== void 0 || M !== null && (!f || (y = fn(l, o)) != null && y.writable)) {
          u === void 0 && (u = a(() => {
            var m = f ? P(l[o]) : D, b = /* @__PURE__ */ p(m);
            return b;
          }), t.set(o, u));
          var h = g(u);
          if (h === D)
            return !1;
        }
        return f;
      },
      set(l, o, u, f) {
        var ie;
        var h = t.get(o), y = o in l;
        if (s && o === "length")
          for (var m = u; m < /** @type {Source<number>} */
          h.v; m += 1) {
            var b = t.get(m + "");
            b !== void 0 ? v(b, D) : m in l && (b = a(() => /* @__PURE__ */ p(D)), t.set(m + "", b));
          }
        if (h === void 0)
          (!y || (ie = fn(l, o)) != null && ie.writable) && (h = a(() => /* @__PURE__ */ p(void 0)), v(h, P(u)), t.set(o, h));
        else {
          y = h.v !== D;
          var x = a(() => P(u));
          v(h, x);
        }
        var G = Reflect.getOwnPropertyDescriptor(l, o);
        if (G != null && G.set && G.set.call(f, u), !y) {
          if (s && typeof o == "string") {
            var se = (
              /** @type {Source<number>} */
              t.get("length")
            ), B = Number(o);
            Number.isInteger(B) && B >= se.v && v(se, B + 1);
          }
          W(i);
        }
        return !0;
      },
      ownKeys(l) {
        g(i);
        var o = Reflect.ownKeys(l).filter((h) => {
          var y = t.get(h);
          return y === void 0 || y.v !== D;
        });
        for (var [u, f] of t)
          f.v !== D && !(u in l) && o.push(u);
        return o;
      },
      setPrototypeOf() {
        bi();
      }
    }
  );
}
var Ri;
// @__NO_SIDE_EFFECTS__
function Ti(n) {
  return (
    /** @type {TemplateNode | null} */
    Ri.call(n)
  );
}
function Is(n) {
  var e = w, t = M;
  Te(null), Xt(null);
  try {
    return n();
  } finally {
    Te(e), Xt(t);
  }
}
function ki(n) {
  M === null && (w === null && pi(), vi()), De && gi();
}
function Oi(n, e) {
  var t = e.last;
  t === null ? e.last = e.first = n : (t.next = n, n.prev = t, e.last = n);
}
function Ps(n, e, t) {
  var s = M;
  s !== null && (s.f & _e) !== 0 && (n |= _e);
  var i = {
    ctx: an,
    deps: null,
    nodes: null,
    f: n | $ | Y,
    first: null,
    fn: e,
    last: null,
    next: null,
    parent: s,
    b: s && s.b,
    prev: null,
    teardown: null,
    wv: 0,
    ac: null
  };
  if (t)
    try {
      ze(i), i.f |= kn;
    } catch (l) {
      throw Nt(i), l;
    }
  else e !== null && Re(i);
  var r = i;
  if (t && r.deps === null && r.teardown === null && r.nodes === null && r.first === r.last && // either `null`, or a singular child
  (r.f & cs) === 0 && (r = r.first, (n & we) !== 0 && (n & zn) !== 0 && r !== null && (r.f |= zn)), r !== null && (r.parent = s, s !== null && Oi(r, s), w !== null && (w.f & k) !== 0 && (n & Se) === 0)) {
    var a = (
      /** @type {Derived} */
      w
    );
    (a.effects ?? (a.effects = [])).push(r);
  }
  return i;
}
function Kt() {
  return w !== null && !ee;
}
function Di(n) {
  ki();
  var e = (
    /** @type {Effect} */
    M.f
  ), t = !w && (e & Oe) !== 0 && (e & kn) === 0;
  if (t) {
    var s = (
      /** @type {ComponentContext} */
      an
    );
    (s.e ?? (s.e = [])).push(n);
  } else
    return Li(n);
}
function Li(n) {
  return Ps(os | di, n, !1);
}
function Vi(n) {
  Ne.ensure();
  const e = Ps(Se | cs, n, !0);
  return () => {
    Nt(e);
  };
}
function Es(n) {
  var e = n.teardown;
  if (e !== null) {
    const t = De, s = w;
    Wn(!0), Te(null);
    try {
      e.call(null);
    } finally {
      Wn(t), Te(s);
    }
  }
}
function Ms(n, e = !1) {
  var t = n.first;
  for (n.first = n.last = null; t !== null; ) {
    const i = t.ac;
    i !== null && Is(() => {
      i.abort(fs);
    });
    var s = t.next;
    (t.f & Se) !== 0 ? t.parent = null : Nt(t, e), t = s;
  }
}
function Fi(n) {
  for (var e = n.first; e !== null; ) {
    var t = e.next;
    (e.f & Oe) === 0 && Nt(e), e = t;
  }
}
function Nt(n, e = !0) {
  var t = !1;
  (e || (n.f & ls) !== 0) && n.nodes !== null && n.nodes.end !== null && (Ui(
    n.nodes.start,
    /** @type {TemplateNode} */
    n.nodes.end
  ), t = !0), Ms(n, e && !t), Zt(n, 0), V(n, pe);
  var s = n.nodes && n.nodes.t;
  if (s !== null)
    for (const r of s)
      r.stop();
  Es(n);
  var i = n.parent;
  i !== null && i.first !== null && xs(n), n.next = n.prev = n.teardown = n.ctx = n.deps = n.fn = n.nodes = n.ac = null;
}
function Ui(n, e) {
  for (; n !== null; ) {
    var t = n === e ? null : /* @__PURE__ */ Ti(n);
    n.remove(), n = t;
  }
}
function xs(n) {
  var e = n.parent, t = n.prev, s = n.next;
  t !== null && (t.next = s), s !== null && (s.prev = t), e !== null && (e.first === n && (e.first = s), e.last === n && (e.last = t));
}
let me = !1;
function Yt(n) {
  me = n;
}
let De = !1;
function Wn(n) {
  De = n;
}
let w = null, ee = !1;
function Te(n) {
  w = n;
}
let M = null;
function Xt(n) {
  M = n;
}
let T = null;
function Gi(n) {
  w !== null && (T === null ? T = [n] : T.push(n));
}
let R = null, F = 0, q = null;
function Bi(n) {
  q = n;
}
let Rs = 1, qe = 0, K = qe;
function Qn(n) {
  K = n;
}
function Ts() {
  return ++Rs;
}
function qt(n) {
  var e = n.f;
  if ((e & $) !== 0)
    return !0;
  if (e & k && (n.f &= ~be), (e & ne) !== 0) {
    var t = n.deps;
    if (t !== null)
      for (var s = t.length, i = 0; i < s; i++) {
        var r = t[i];
        if (qt(
          /** @type {Derived} */
          r
        ) && Cs(
          /** @type {Derived} */
          r
        ), r.wv > n.wv)
          return !0;
      }
    (e & Y) !== 0 && // During time traveling we don't want to reset the status so that
    // traversal of the graph in the other batches still happens
    A === null && V(n, L);
  }
  return !1;
}
function ks(n, e, t = !0) {
  var s = n.reactions;
  if (s !== null && !(T != null && T.includes(n)))
    for (var i = 0; i < s.length; i++) {
      var r = s[i];
      (r.f & k) !== 0 ? ks(
        /** @type {Derived} */
        r,
        e,
        !1
      ) : e === r && (t ? V(r, $) : (r.f & L) !== 0 && V(r, ne), Re(
        /** @type {Effect} */
        r
      ));
    }
}
function Os(n) {
  var b;
  var e = R, t = F, s = q, i = w, r = T, a = an, l = ee, o = K, u = n.f;
  R = /** @type {null | Value[]} */
  null, F = 0, q = null, w = (u & (Oe | Se)) === 0 ? n : null, T = null, jn(n.ctx), ee = !1, K = ++qe, n.ac !== null && (Is(() => {
    n.ac.abort(fs);
  }), n.ac = null);
  try {
    n.f |= bn;
    var f = (
      /** @type {Function} */
      n.fn
    ), h = f(), y = n.deps;
    if (R !== null) {
      var m;
      if (Zt(n, F), y !== null && F > 0)
        for (y.length = F + R.length, m = 0; m < R.length; m++)
          y[F + m] = R[m];
      else
        n.deps = y = R;
      if (Kt() && (n.f & Y) !== 0)
        for (m = F; m < y.length; m++)
          ((b = y[m]).reactions ?? (b.reactions = [])).push(n);
    } else y !== null && F < y.length && (Zt(n, F), y.length = F);
    if (hs() && q !== null && !ee && y !== null && (n.f & (k | ne | $)) === 0)
      for (m = 0; m < /** @type {Source[]} */
      q.length; m++)
        ks(
          q[m],
          /** @type {Effect} */
          n
        );
    return i !== null && i !== n && (qe++, q !== null && (s === null ? s = q : s.push(.../** @type {Source[]} */
    q))), (n.f & Be) !== 0 && (n.f ^= Be), h;
  } catch (x) {
    return Ii(x);
  } finally {
    n.f ^= bn, R = e, F = t, q = s, w = i, T = r, jn(a), ee = l, K = o;
  }
}
function Ni(n, e) {
  let t = e.reactions;
  if (t !== null) {
    var s = ai.call(t, n);
    if (s !== -1) {
      var i = t.length - 1;
      i === 0 ? t = e.reactions = null : (t[s] = t[i], t.pop());
    }
  }
  t === null && (e.f & k) !== 0 && // Destroying a child effect while updating a parent effect can cause a dependency to appear
  // to be unused, when in fact it is used by the currently-updating parent. Checking `new_deps`
  // allows us to skip the expensive work of disconnecting and immediately reconnecting it
  (R === null || !R.includes(e)) && (V(e, ne), (e.f & Y) !== 0 && (e.f ^= Y, e.f &= ~be), Ss(
    /** @type {Derived} **/
    e
  ), Zt(
    /** @type {Derived} **/
    e,
    0
  ));
}
function Zt(n, e) {
  var t = n.deps;
  if (t !== null)
    for (var s = e; s < t.length; s++)
      Ni(n, t[s]);
}
function ze(n) {
  var e = n.f;
  if ((e & pe) === 0) {
    V(n, L);
    var t = M, s = me;
    M = n, me = !0;
    try {
      (e & (we | hi)) !== 0 ? Fi(n) : Ms(n), Es(n);
      var i = Os(n);
      n.teardown = typeof i == "function" ? i : null, n.wv = Rs;
      var r;
      yn && Ci && (n.f & $) !== 0 && n.deps;
    } finally {
      me = s, M = t;
    }
  }
}
function g(n) {
  var e = n.f, t = (e & k) !== 0;
  if (w !== null && !ee) {
    var s = M !== null && (M.f & pe) !== 0;
    if (!s && !(T != null && T.includes(n))) {
      var i = w.deps;
      if ((w.f & bn) !== 0)
        n.rv < qe && (n.rv = qe, R === null && i !== null && i[F] === n ? F++ : R === null ? R = [n] : R.includes(n) || R.push(n));
      else {
        (w.deps ?? (w.deps = [])).push(n);
        var r = n.reactions;
        r === null ? n.reactions = [w] : r.includes(w) || r.push(w);
      }
    }
  }
  if (De) {
    if (oe.has(n))
      return oe.get(n);
    if (t) {
      var a = (
        /** @type {Derived} */
        n
      ), l = a.v;
      return ((a.f & L) === 0 && a.reactions !== null || Ls(a)) && (l = On(a)), oe.set(a, l), l;
    }
  } else t && (!(A != null && A.has(n)) || S != null && S.is_fork && !Kt()) && (a = /** @type {Derived} */
  n, qt(a) && Cs(a), me && Kt() && (a.f & Y) === 0 && Ds(a));
  if (A != null && A.has(n))
    return A.get(n);
  if ((n.f & Be) !== 0)
    throw n.v;
  return n.v;
}
function Ds(n) {
  if (n.deps !== null) {
    n.f ^= Y;
    for (const e of n.deps)
      (e.reactions ?? (e.reactions = [])).push(n), (e.f & k) !== 0 && (e.f & Y) === 0 && Ds(
        /** @type {Derived} */
        e
      );
  }
}
function Ls(n) {
  if (n.v === D) return !0;
  if (n.deps === null) return !1;
  for (const e of n.deps)
    if (oe.has(e) || (e.f & k) !== 0 && Ls(
      /** @type {Derived} */
      e
    ))
      return !0;
  return !1;
}
function qi(n) {
  var e = ee;
  try {
    return ee = !0, n();
  } finally {
    ee = e;
  }
}
const zi = -7169;
function V(n, e) {
  n.f = n.f & zi | e;
}
const Vs = "triiiceratops-viewer";
class $i extends Error {
  constructor(t, s) {
    super(
      `This viewer handle is already bound to ${t} and cannot also be bound to ${s}. A handle identifies exactly one viewer: create one handle per <TriiiceratopsViewer> (React: a separate useViewerHandle() call; Vue: a separate template ref).`
    );
    _(this, "code", "VIEWER_HANDLE_CONFLICT");
    this.name = "TriiiceratopsHandleConflictError";
  }
}
function Kn(n) {
  if (!n) return "no element";
  const e = n.getAttribute("id"), t = n.getAttribute("class");
  return `<${n.localName}` + (e ? ` id="${e}"` : "") + (t ? ` class="${t}"` : "") + ">";
}
function ji() {
  let n = null, e = null, t = !1, s = !1;
  const i = /* @__PURE__ */ new Set(), r = () => {
    for (const l of [...i]) l();
  };
  return {
    get: () => n,
    subscribe(l) {
      i.add(l);
      let o = !1;
      return () => {
        o || (o = !0, i.delete(l));
      };
    },
    armUnboundWarning() {
      if (t || s) return () => {
      };
      const l = setTimeout(() => {
        t || s || (s = !0, mn.warn(
          "A Triiiceratops viewer handle was created but never passed to a <TriiiceratopsViewer>. Reads through it will stay null forever. Pass it to the viewer (React: the `handle` prop; Vue: the template ref) — or drop the handle if nothing reads viewer state."
        ));
      }, 0);
      let o = !1;
      return () => {
        o || (o = !0, clearTimeout(l));
      };
    },
    claim(l) {
      if (e && e !== l)
        throw new $i(
          Kn(e),
          Kn(l)
        );
      e = l, t = !0;
      let o = !0;
      return {
        publish(u) {
          o && n !== u && (n = u, r());
        },
        release() {
          o && (o = !1, e === l && (e = null, n !== null && (n = null, r())));
        }
      };
    }
  };
}
const Yn = [
  "animation",
  "viewport-change",
  "animation-finish"
];
function Hi(n, e = {}) {
  let t = !1, s = 0, i = 0;
  const r = /* @__PURE__ */ new Set(), a = /* @__PURE__ */ new Set();
  let l = null;
  const o = () => {
    i++;
    for (const m of [...a])
      try {
        m();
      } catch (b) {
        e.onListenerError ? e.onListenerError(b) : mn.error("selector frame listener failed", b);
      }
  }, u = () => {
    const m = !t && a.size > 0 ? n.osdViewer ?? null : null;
    if (m !== l) {
      if (l)
        for (const b of Yn)
          l.removeHandler(b, o);
      if (l = m, l)
        for (const b of Yn)
          l.addHandler(b, o);
    }
  }, f = n.subscribe(() => {
    s++, u();
    for (const m of [...r]) m();
    for (const m of [...a]) m();
  }, e.onListenerError);
  function h(m, b = {}) {
    const x = b.equals ?? Object.is, G = b.cadence ?? "state", se = G === "frame" ? a : r;
    let B = -1, ie = !1, Le, Ce = null, ln = !1, Fn = !1;
    const cn = () => G === "frame" ? s + i : s, Ys = () => G === "state" && !Fn && !ln && qn(), Xs = () => {
      if (G === "state" && !ln && qn()) {
        Fn = !0;
        const N = Wi(
          n,
          () => m(n)
        );
        return N.readOsdViewer && (ln = !0, mn.warn(
          "A `state`-cadence selector read `osdViewer`. Values read THROUGH the OpenSeadragon instance (zoom, pan, rotation, bounds) never wake the batched state watcher, so such a projection appears frozen: pass `cadence: 'frame'` to wake it from OpenSeadragon's own animation events instead. (Reading `osdViewer` only to test readiness is correct at `state` cadence — it is an inventoried member.)"
        )), N.value;
      }
      return m(n);
    }, Un = () => {
      let N;
      try {
        N = Xs();
      } catch (le) {
        Ce = { error: le };
        return;
      }
      if (ie) {
        let le;
        try {
          le = x(Le, N);
        } catch (Zs) {
          Ce = { error: Zs };
          return;
        }
        if (le) {
          Ce = null;
          return;
        }
      }
      Le = N, ie = !0, Ce = null;
    }, Gn = () => {
      if (Ce) throw Ce.error;
      return Le;
    };
    return {
      cadence: G,
      get version() {
        return cn();
      },
      read() {
        const N = cn();
        return (B !== N || Ys()) && (B = N, Un()), Gn();
      },
      recompute() {
        return B = cn(), Un(), Gn();
      },
      subscribe(N) {
        if (t) return () => {
        };
        se.add(N), u();
        let le = !1;
        return () => {
          le || (le = !0, se.delete(N), u());
        };
      }
    };
  }
  return {
    selectors: {
      select(m, b = Object.is) {
        const x = h(m, { equals: b });
        return {
          get: () => x.read(),
          subscribe(G) {
            if (t) return () => {
            };
            let se = x.read();
            return x.subscribe(() => {
              var ie;
              let B;
              try {
                B = x.read();
              } catch (Le) {
                (ie = e.onProjectionError) == null || ie.call(e, Le);
                return;
              }
              b(se, B) || (se = B, G(B));
            });
          }
        };
      }
    },
    createProjection: h,
    dispose() {
      t || (t = !0, r.clear(), a.clear(), u(), f());
    }
  };
}
let dn = !1;
function Wi(n, e) {
  const t = Qi(n, "osdViewer");
  if (!(t != null && t.get) || !Object.isExtensible(n) || dn)
    return { value: e(), readOsdViewer: !1 };
  const { get: s, set: i } = t;
  let r = !1;
  dn = !0, Object.defineProperty(n, "osdViewer", {
    configurable: !0,
    enumerable: t.enumerable ?? !0,
    get: () => (r = !0, s.call(n)),
    set: (a) => {
      i == null || i.call(n, a);
    }
  });
  try {
    return { value: e(), readOsdViewer: r };
  } finally {
    dn = !1, Reflect.deleteProperty(n, "osdViewer");
  }
}
function Qi(n, e) {
  let t = Object.getPrototypeOf(n);
  for (; t; ) {
    const s = Object.getOwnPropertyDescriptor(t, e);
    if (s) return s;
    t = Object.getPrototypeOf(t);
  }
}
var Ki = ["forEach", "isDisjointFrom", "isSubsetOf", "isSupersetOf"], Yi = ["difference", "intersection", "symmetricDifference", "union"], Xn = !1, xe, H, re, tn, ke, Fs, Us;
const nn = class nn extends Set {
  /**
   * @param {Iterable<T> | null | undefined} [value]
   */
  constructor(t) {
    super();
    d(this, ke);
    /** @type {Map<T, Source<boolean>>} */
    d(this, xe, /* @__PURE__ */ new Map());
    d(this, H, /* @__PURE__ */ p(0));
    d(this, re, /* @__PURE__ */ p(0));
    d(this, tn, K || -1);
    if (t) {
      for (var s of t)
        super.add(s);
      c(this, re).v = super.size;
    }
    Xn || C(this, ke, Us).call(this);
  }
  /** @param {T} value */
  has(t) {
    var s = super.has(t), i = c(this, xe), r = i.get(t);
    if (r === void 0) {
      if (!s)
        return g(c(this, H)), !1;
      r = C(this, ke, Fs).call(this, !0), i.set(t, r);
    }
    return g(r), s;
  }
  /** @param {T} value */
  add(t) {
    return super.has(t) || (super.add(t), v(c(this, re), super.size), W(c(this, H))), this;
  }
  /** @param {T} value */
  delete(t) {
    var s = super.delete(t), i = c(this, xe), r = i.get(t);
    return r !== void 0 && (i.delete(t), v(r, !1)), s && (v(c(this, re), super.size), W(c(this, H))), s;
  }
  clear() {
    if (super.size !== 0) {
      super.clear();
      var t = c(this, xe);
      for (var s of t.values())
        v(s, !1);
      t.clear(), v(c(this, re), 0), W(c(this, H));
    }
  }
  keys() {
    return this.values();
  }
  values() {
    return g(c(this, H)), super.values();
  }
  entries() {
    return g(c(this, H)), super.entries();
  }
  [Symbol.iterator]() {
    return this.keys();
  }
  get size() {
    return g(c(this, re));
  }
};
xe = new WeakMap(), H = new WeakMap(), re = new WeakMap(), tn = new WeakMap(), ke = new WeakSet(), /**
 * If the source is being created inside the same reaction as the SvelteSet instance,
 * we use `state` so that it will not be a dependency of the reaction. Otherwise we
 * use `source` so it will be.
 *
 * @template T
 * @param {T} value
 * @returns {Source<T>}
 */
Fs = function(t) {
  return K === c(this, tn) ? /* @__PURE__ */ p(t) : Dn(t);
}, // We init as part of the first instance so that we can treeshake this class
Us = function() {
  Xn = !0;
  var t = nn.prototype, s = Set.prototype;
  for (const i of Ki)
    t[i] = function(...r) {
      return g(c(this, H)), s[i].apply(this, r);
    };
  for (const i of Yi)
    t[i] = function(...r) {
      g(c(this, H));
      var a = (
        /** @type {Set<T>} */
        s[i].apply(this, r)
      );
      return new nn(a);
    };
};
let Ae = nn;
var X, Z, te, sn, Q, Ve, Ht;
const Vn = class Vn extends Map {
  /**
   * @param {Iterable<readonly [K, V]> | null | undefined} [value]
   */
  constructor(t) {
    super();
    d(this, Q);
    /** @type {Map<K, Source<number>>} */
    d(this, X, /* @__PURE__ */ new Map());
    d(this, Z, /* @__PURE__ */ p(0));
    d(this, te, /* @__PURE__ */ p(0));
    d(this, sn, K || -1);
    if (t) {
      for (var [s, i] of t)
        super.set(s, i);
      c(this, te).v = super.size;
    }
  }
  /** @param {K} key */
  has(t) {
    var s = c(this, X), i = s.get(t);
    if (i === void 0) {
      var r = super.get(t);
      if (r !== void 0)
        i = C(this, Q, Ve).call(this, 0), s.set(t, i);
      else
        return g(c(this, Z)), !1;
    }
    return g(i), !0;
  }
  /**
   * @param {(value: V, key: K, map: Map<K, V>) => void} callbackfn
   * @param {any} [this_arg]
   */
  forEach(t, s) {
    C(this, Q, Ht).call(this), super.forEach(t, s);
  }
  /** @param {K} key */
  get(t) {
    var s = c(this, X), i = s.get(t);
    if (i === void 0) {
      var r = super.get(t);
      if (r !== void 0)
        i = C(this, Q, Ve).call(this, 0), s.set(t, i);
      else {
        g(c(this, Z));
        return;
      }
    }
    return g(i), super.get(t);
  }
  /**
   * @param {K} key
   * @param {V} value
   * */
  set(t, s) {
    var h;
    var i = c(this, X), r = i.get(t), a = super.get(t), l = super.set(t, s), o = c(this, Z);
    if (r === void 0)
      r = C(this, Q, Ve).call(this, 0), i.set(t, r), v(c(this, te), super.size), W(o);
    else if (a !== s) {
      W(r);
      var u = o.reactions === null ? null : new Set(o.reactions), f = u === null || !((h = r.reactions) != null && h.every(
        (y) => (
          /** @type {NonNullable<typeof v_reactions>} */
          u.has(y)
        )
      ));
      f && W(o);
    }
    return l;
  }
  /** @param {K} key */
  delete(t) {
    var s = c(this, X), i = s.get(t), r = super.delete(t);
    return i !== void 0 && (s.delete(t), v(c(this, te), super.size), v(i, -1), W(c(this, Z))), r;
  }
  clear() {
    if (super.size !== 0) {
      super.clear();
      var t = c(this, X);
      v(c(this, te), 0);
      for (var s of t.values())
        v(s, -1);
      W(c(this, Z)), t.clear();
    }
  }
  keys() {
    return g(c(this, Z)), super.keys();
  }
  values() {
    return C(this, Q, Ht).call(this), super.values();
  }
  entries() {
    return C(this, Q, Ht).call(this), super.entries();
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  get size() {
    return g(c(this, te)), super.size;
  }
};
X = new WeakMap(), Z = new WeakMap(), te = new WeakMap(), sn = new WeakMap(), Q = new WeakSet(), /**
 * If the source is being created inside the same reaction as the SvelteMap instance,
 * we use `state` so that it will not be a dependency of the reaction. Otherwise we
 * use `source` so it will be.
 *
 * @template T
 * @param {T} value
 * @returns {Source<T>}
 */
Ve = function(t) {
  return K === c(this, sn) ? /* @__PURE__ */ p(t) : Dn(t);
}, Ht = function() {
  g(c(this, Z));
  var t = c(this, X);
  if (c(this, te).v !== t.size) {
    for (var s of Nn(Vn.prototype, this, "keys").call(this))
      if (!t.has(s)) {
        var i = C(this, Q, Ve).call(this, 0);
        t.set(s, i);
      }
  }
  for ([, i] of c(this, X))
    g(i);
};
let U = Vn;
async function Zn(n, e) {
  const t = await fetch(n, {
    headers: e == null ? void 0 : e.headers,
    credentials: e != null && e.withCredentials ? "include" : "same-origin"
  });
  if (!t.ok)
    throw new Error(`HTTP error! status: ${t.status}`);
  return t.json();
}
const An = {
  debug: (...n) => void 0,
  info: (...n) => void 0,
  warn: (...n) => void 0,
  error: (...n) => void 0
};
function ye(n) {
  return Array.isArray(n) ? n : n == null ? [] : [n];
}
const Jn = /* @__PURE__ */ new WeakSet();
function Xi(n) {
  !n || typeof n != "object" || Jn.has(n) || (Jn.add(n), n.id ?? n["@id"], ["images", "items", "content"].filter(
    (e) => n[e] !== void 0
  ));
}
function Zi(n) {
  const e = (n == null ? void 0 : n.type) ?? (n == null ? void 0 : n["@type"]);
  return e === "Collection" || e === "sc:Collection";
}
function Gs(n) {
  if (!n || typeof n != "object") return [];
  if (Zi(n)) return [];
  const e = n.mediaSequences ?? n.sequences;
  return e ? ye(e).filter((t) => !!t) : n.items ? [n.items] : [];
}
function Ji(n) {
  if (!n) return [];
  const e = n.canvases ?? n.elements;
  return e ? ye(e).filter((t) => !!t) : Array.isArray(n) ? n.filter((t) => !!t) : [];
}
function gn(n) {
  return Gs(n).length;
}
function vn(n, e) {
  const t = Gs(n);
  if (!t.length) return [];
  const s = Math.max(0, Math.min(e, t.length - 1));
  return Ji(t[s]);
}
function er(n) {
  if (!n) return [];
  const e = ye(n.images).filter((i) => !!i);
  if (e.length > 0) return e;
  const s = ye(n.items ?? n.content).flatMap(
    (i) => ye(i == null ? void 0 : i.items).filter((r) => !!r)
  );
  return s.length === 0 && Xi(n), s;
}
function es(n) {
  return (n == null ? void 0 : n.body) || (n == null ? void 0 : n.resource) || null;
}
function ts(n) {
  if (!n || Array.isArray(n)) return !1;
  const e = n.type || n["@type"];
  return e === "Choice" || e === "oa:Choice";
}
function ns(n) {
  return n ? [
    ...ye(n.default),
    ...ye(n.items || n.item)
  ].filter((e) => !!e) : [];
}
function tr(n) {
  const e = (n == null ? void 0 : n.behavior) || [];
  return e ? (Array.isArray(e) ? e : [e]).map((s) => {
    const i = String(s).trim().toLowerCase(), r = i.split(/[#/:]/);
    return r[r.length - 1] || i;
  }) : [];
}
var je;
class nr {
  constructor() {
    d(this, je, /* @__PURE__ */ p(P({})));
    _(this, "pendingFetches", new U());
  }
  get manifests() {
    return g(c(this, je));
  }
  set manifests(e) {
    v(c(this, je), e, !0);
  }
  async registerManifest(e, t) {
    this.manifests[e] = { json: t, isFetching: !1 };
  }
  // === Manifest Fetching ===
  /**
   * Fetch a IIIF resource by URL and return the raw JSON.
   * Does not register it as a manifest. Used for collection detection.
   */
  async fetchResource(e, t) {
    return Zn(e, t);
  }
  async fetchManifest(e, t) {
    const s = this.manifests[e];
    if (s != null && s.isFetching) {
      await this.pendingFetches.get(e);
      return;
    }
    if (s != null && s.json)
      return;
    this.manifests[e] = { isFetching: !0 };
    const i = (async () => {
      const r = await Zn(e, t);
      await this.registerManifest(e, r);
    })();
    this.pendingFetches.set(e, i);
    try {
      await i;
    } catch (r) {
      this.manifests[e] = { error: r.message, isFetching: !1 };
    } finally {
      this.pendingFetches.delete(e);
    }
  }
  clearManifest(e) {
    delete this.manifests[e];
  }
  getManifestEntry(e) {
    return this.manifests[e];
  }
  async fetchAnnotationList(e) {
    if (!this.manifests[e])
      try {
        const t = await fetch(e);
        if (t.ok) {
          const s = await t.json();
          this.manifests[e] = { json: s };
        } else
          An.error(`Failed to fetch annotation list: ${e}`);
      } catch {
      }
  }
  getStructureSequences(e) {
    const t = this.getManifestEntry(e), s = t == null ? void 0 : t.json, i = s == null ? void 0 : s.structures;
    if (!Array.isArray(i) || !i.length)
      return [];
    const r = i.filter((o) => {
      const u = o == null ? void 0 : o.behavior;
      return (Array.isArray(u) ? u : u ? [u] : []).some((h) => String(h).trim().toLowerCase() === "sequence");
    });
    if (!r.length)
      return [];
    const a = new U(), l = gn(s);
    for (let o = 0; o < l; o++)
      for (const u of vn(s, o)) {
        const f = (u == null ? void 0 : u.id) || (u == null ? void 0 : u["@id"]);
        f && !a.has(f) && a.set(f, u);
      }
    return r.map((o) => (Array.isArray(o == null ? void 0 : o.items) ? o.items : []).map((f) => {
      const h = typeof f == "string" ? f : (f == null ? void 0 : f.type) === "Canvas" || (f == null ? void 0 : f["@type"]) === "Canvas" ? f.id || f["@id"] : null;
      return h ? a.get(h) : null;
    }).filter(Boolean)).filter((o) => o.length > 0);
  }
  findCanvasInJson(e, t) {
    if (!e || typeof e != "object")
      return null;
    const s = e.id || e["@id"], i = e.type || e["@type"];
    if (s === t && (i === "Canvas" || i === "sc:Canvas"))
      return e;
    const r = [
      e.items,
      e.canvases,
      e.sequences,
      e.members
    ];
    for (const a of r)
      if (Array.isArray(a))
        for (const l of a) {
          const o = this.findCanvasInJson(l, t);
          if (o)
            return o;
        }
    return null;
  }
  getCanvasJson(e, t) {
    var r;
    const s = (r = this.getManifestEntry(e)) == null ? void 0 : r.json, i = gn(s);
    for (let a = 0; a < i; a++) {
      const l = vn(s, a).find((o) => ((o == null ? void 0 : o.id) || (o == null ? void 0 : o["@id"])) === t);
      if (l)
        return l;
    }
    return this.findCanvasInJson(s, t);
  }
  getCanvasAnnotationListRefs(e) {
    var s, i;
    const t = new Ae();
    return (s = e == null ? void 0 : e.otherContent) == null || s.forEach((r) => {
      const a = r["@id"] || r.id;
      a && !r.resources && t.add(a);
    }), (i = e == null ? void 0 : e.annotations) == null || i.forEach((r) => {
      const a = r.id || r["@id"];
      a && !r.items && t.add(a);
    }), [...t];
  }
  matchesAnnotationSource(e, t) {
    return t ? ((e == null ? void 0 : e.id) || (e == null ? void 0 : e["@id"])) === t : !0;
  }
  async ensureCanvasAnnotations(e, t, s) {
    const i = this.getCanvasJson(e, t);
    if (!i)
      return [];
    const r = this.getCanvasAnnotationListRefs(i).filter((a) => !s || a === s);
    return await Promise.all(r.map(async (a) => {
      this.manifests[a] || await this.fetchAnnotationList(a);
    })), this.getAnnotations(e, t, s);
  }
  /**
   * How many sequences the active manifest offers, as the sequence picker
   * counts them. Ranges with `behavior: "sequence"` define the sequences when
   * the manifest has any; the manifest's own sequences are the fallback.
   */
  getSequenceCount(e) {
    var s;
    const t = this.getStructureSequences(e);
    return t.length ? t.length : gn((s = this.getManifestEntry(e)) == null ? void 0 : s.json);
  }
  /**
   * The canvases of one sequence, as **raw IIIF Canvas JSON** — v2 or v3 as
   * the manifest authored it, never a library object. Read them with core's
   * version-neutral helpers rather than by branching on IIIF version.
   *
   * Structure-derived sequences take priority, as above. `sequenceIndex` is
   * clamped into range in either case.
   */
  getCanvases(e, t = 0) {
    var i;
    const s = this.getStructureSequences(e);
    return s.length ? s[Math.max(0, Math.min(t, s.length - 1))] : vn((i = this.getManifestEntry(e)) == null ? void 0 : i.json, t);
  }
  getAnnotations(e, t, s) {
    return this.manualGetAnnotations(e, t, s);
  }
  manualGetAnnotations(e, t, s) {
    const i = this.getCanvasJson(e, t);
    if (!i) return [];
    const r = [], a = (u) => !u || typeof u != "object" ? u : {
      ...u,
      __triiiceratopsCanvas: {
        id: i.id || i["@id"] || t,
        width: i.width,
        height: i.height
      },
      __triiiceratopsAnnotationOrigin: "manifest"
    }, l = (u) => {
      const f = Array.isArray(u) ? u : u ? [u] : [];
      for (const h of f)
        r.push(a(h));
    }, o = (u, f) => {
      u == null || u.forEach((h) => {
        var b;
        if (!this.matchesAnnotationSource(h, s))
          return;
        const y = h["@id"] || h.id, m = h[f];
        if (y && !m) {
          const x = (b = this.manifests[y]) == null ? void 0 : b.json;
          x ? l(x.resources || x.items) : this.manifests[y] || this.fetchAnnotationList(y);
        } else m && l(m);
      });
    };
    return o(i.otherContent, "resources"), o(i.annotations, "items"), r;
  }
}
je = new WeakMap();
const E = new nr(), sr = [
  // ---- Core navigation & manifest selection --------------------------------
  {
    member: "manifestId",
    classification: "command",
    commands: ["setManifest", "setManifestData", "loadCollectionManifest"],
    notes: "Active manifest; changed by loading a manifest/collection."
  },
  {
    member: "canvasId",
    classification: "command",
    commands: ["setCanvas", "nextCanvas", "previousCanvas"],
    notes: "Active canvas; navigation maintains paged-group invariants."
  },
  {
    member: "selectedSequenceIndex",
    classification: "command",
    commands: ["setSequenceIndex"],
    notes: "Clamped to the manifest sequence range and resets the canvas."
  },
  {
    member: "startCanvasId",
    classification: "internal",
    notes: "Manifest-load bookkeeping: mirrors the manifest `start` property (v3) or sequence `startCanvas` (v2) during auto-selection and is cleared as a control-flow flag. No plugin contract."
  },
  {
    member: "initialCanvasRegion",
    classification: "command",
    commands: ["setInitialCanvasRegion"],
    notes: "Content-state initial viewport region input."
  },
  {
    member: "selectedChoices",
    classification: "command",
    commands: ["selectChoice"],
    notes: "Reactive SvelteMap of canvasId -> choiceId (IIIF Choice); declared as a plain Map (see REACTIVE_COLLECTION_MEMBERS)."
  },
  // ---- Panels, toolbar & chrome toggles ------------------------------------
  {
    member: "showAnnotations",
    classification: "command",
    commands: ["toggleAnnotations"],
    notes: "Panel open state; toggle maintains annotation-visibility invariants (canonical non-bare-setter command)."
  },
  {
    member: "showThumbnailGallery",
    classification: "command",
    commands: ["toggleThumbnailGallery"]
  },
  {
    member: "galleryExpanded",
    classification: "command",
    commands: ["setGalleryExpanded", "toggleGalleryExpanded"],
    notes: "Gallery expanded to fill the center column as a grid. Orthogonal to dockSide; expanding implies showThumbnailGallery, which is why it is a command and not a field write."
  },
  {
    member: "toolbarOpen",
    classification: "command",
    commands: ["toggleToolbar"]
  },
  {
    member: "showMetadataPanel",
    classification: "command",
    commands: ["toggleMetadataPanel"]
  },
  {
    member: "showCanvasInfo",
    classification: "command",
    commands: ["toggleCanvasInfo"]
  },
  {
    member: "showStructuresPanel",
    classification: "command",
    commands: ["toggleStructuresPanel"]
  },
  {
    member: "showCollectionPanel",
    classification: "command",
    commands: ["toggleCollectionPanel"]
  },
  {
    member: "showSearchPanel",
    classification: "command",
    commands: ["toggleSearchPanel"],
    notes: "Closing clears ephemeral search annotations (invariant)."
  },
  // ---- Annotation overlay visibility ---------------------------------------
  {
    member: "visibleAnnotationIds",
    classification: "command",
    commands: [
      "showCurrentCanvasAnnotations",
      "setAnnotationVisible",
      "setAllAnnotationsVisible"
    ],
    notes: "Reactive SvelteSet of visible annotation ids; declared as a plain Set (see REACTIVE_COLLECTION_MEMBERS). Parity commands setAnnotationVisible/setAllAnnotationsVisible added this ticket."
  },
  {
    member: "annotationVisibilityTouched",
    classification: "command",
    commands: ["setAnnotationVisible", "setAllAnnotationsVisible"],
    notes: "Marks that the user manually changed annotation visibility. Maintained together with visibleAnnotationIds by the visibility commands."
  },
  {
    member: "hoveredAnnotationId",
    classification: "command",
    commands: ["setHoveredAnnotationId"],
    notes: "Set on annotation hover by the overlay and panel. Parity command added this ticket."
  },
  {
    member: "userAnnotations",
    classification: "command",
    commands: ["setUserAnnotations", "clearUserAnnotations"],
    notes: "Per-viewer plugin-written annotation display state (SvelteMap keyed by manifestId::canvasId, declared as a plain Map — see REACTIVE_COLLECTION_MEMBERS). Moved off the page-shared manifest cache onto ViewerState (ticket 05, ADR 0007) so annotations never leak between viewers; the annotation-editor store display-syncs through these commands."
  },
  // ---- Manifest readiness (per-viewer view of the shared cache) ------------
  {
    member: "loadedManifestIds",
    classification: "observable",
    notes: "Manifest ids this viewer has finished loading (SvelteSet, declared as a plain Set — see REACTIVE_COLLECTION_MEMBERS). Core adds to it at manifest-load completion, giving subscribers a manifest-readiness notification; queried via isManifestReady(). Added ticket 05."
  },
  // ---- Active locale (per-viewer i18n contract) ----------------------------
  {
    member: "activeLocale",
    classification: "observable",
    notes: "This viewer's active locale (BCP-47): config.locale if set, else the page default (CONTEXT.md Active locale). Observable — readable and notifying, no plugin-facing mutator; locale is controlled through config.locale. Core (the viewer root) mirrors the resolved value onto it when the config or page locale changes (like isFullScreen); all chrome renders in it and ticket 08's PluginLocaleService consumes it. Added ticket 06."
  },
  // ---- Viewing mode / direction / paging -----------------------------------
  {
    member: "viewingMode",
    classification: "command",
    commands: ["setViewingMode", "updateConfig"],
    notes: "Public accessor over _viewingMode; command re-selects the paged group when needed."
  },
  {
    member: "viewingDirection",
    classification: "command",
    commands: ["updateConfig"],
    notes: "Public accessor over _viewingDirection. User-actionable via the settings control, which flows through config -> updateConfig; also derived from the manifest."
  },
  {
    member: "pagedOffset",
    classification: "command",
    commands: ["togglePagedOffset"]
  },
  {
    member: "_viewingMode",
    classification: "internal",
    notes: "Private $state backing field for the viewingMode accessor."
  },
  {
    member: "_viewingDirection",
    classification: "internal",
    notes: "Private $state backing field for the viewingDirection accessor."
  },
  {
    member: "_viewingModeUserConfigured",
    classification: "internal",
    notes: "Private flag: skips manifest behavior detection once the host configures a viewing mode."
  },
  // ---- Configuration & host-provided inputs --------------------------------
  {
    member: "config",
    classification: "command",
    commands: ["updateConfig"],
    notes: "ViewerConfig object; updateConfig fans changes out to derived state while maintaining invariants."
  },
  {
    member: "searchProvider",
    classification: "command",
    commands: ["setSearchProvider"],
    notes: "Host-supplied custom search provider."
  },
  {
    member: "manifestRequestConfig",
    classification: "command",
    commands: ["setManifestRequestConfig"],
    notes: "Host-supplied fetch options for manifest requests."
  },
  // ---- Search --------------------------------------------------------------
  {
    member: "searchQuery",
    classification: "command",
    commands: ["search"],
    notes: "The executed query; set by the search command (and by config-driven search)."
  },
  {
    member: "searchResults",
    classification: "observable",
    notes: "Result groups produced by core in response to a search operation; no direct mutator."
  },
  {
    member: "searchAnnotations",
    classification: "observable",
    notes: "Search-hit overlay annotations derived by core from searchResults; read by the overlay, not directly settable."
  },
  {
    member: "isSearching",
    classification: "observable",
    notes: "Fetch flag reflecting an in-flight search operation."
  },
  {
    member: "pendingSearchQuery",
    classification: "internal",
    notes: "Deferred-search bookkeeping: holds a query issued before the manifest loaded. No plugin contract."
  },
  // ---- Collections ---------------------------------------------------------
  {
    member: "collectionId",
    classification: "observable",
    notes: "Set by core when a loaded resource resolves to a IIIF Collection."
  },
  {
    member: "collectionLabel",
    classification: "observable",
    notes: "Mirrors the loaded collection label."
  },
  {
    member: "collectionThumbnail",
    classification: "observable",
    notes: "Mirrors the loaded collection thumbnail."
  },
  {
    member: "collectionItems",
    classification: "observable",
    notes: "Parsed, sorted collection members; core writes these on load and hydrates thumbnails."
  },
  // ---- Fullscreen ----------------------------------------------------------
  {
    member: "isFullScreen",
    classification: "observable",
    notes: "Mirrors document.fullscreenElement via a fullscreenchange listener. The user-actionable behavior is the toggleFullScreen() command, which changes the underlying browser fact rather than writing this field."
  },
  // ---- Gallery placement (floating & docked) -------------------------------
  {
    member: "galleryPosition",
    classification: "command",
    commands: ["setGalleryPosition"],
    notes: "Floating gallery position; parity command added this ticket."
  },
  {
    member: "gallerySize",
    classification: "command",
    commands: ["setGallerySize"],
    notes: "Floating gallery size; parity command added this ticket."
  },
  {
    member: "dockSide",
    classification: "command",
    commands: ["setDockSide"],
    notes: "Dock edge; setDockSide keeps the derived docked flags in sync (parity command added this ticket)."
  },
  {
    member: "isGalleryDockedBottom",
    classification: "command",
    commands: ["setDockSide"],
    notes: "Derived from dockSide; maintained as an invariant by setDockSide."
  },
  {
    member: "isGalleryDockedRight",
    classification: "command",
    commands: ["setDockSide"],
    notes: "Derived from dockSide; maintained as an invariant by setDockSide."
  },
  {
    member: "isGalleryDragging",
    classification: "internal",
    notes: "Transient drag-gesture bookkeeping owned by the gallery UI; no durable plugin-facing meaning."
  },
  {
    member: "galleryDragOffset",
    classification: "internal",
    notes: "Transient pointer offset captured during a gallery drag gesture."
  },
  {
    member: "dragOverSide",
    classification: "internal",
    notes: "Transient dock-preview side highlighted while dragging the gallery."
  },
  {
    member: "galleryCenterPanelRect",
    classification: "internal",
    notes: "Measured DOMRect of the center panel captured at drag start (shadow-DOM safe). Layout bookkeeping, no contract."
  },
  // ---- Errors & OSD pass-through --------------------------------------------
  {
    member: "tileSourceError",
    classification: "observable",
    notes: "Tile-source auth/load failure written by core in response to OSD errors; no mutator."
  },
  {
    member: "osdViewer",
    classification: "observable",
    notes: "Raw OpenSeadragon.Viewer set at OSD readiness (notifyOSDReady); documented pass-through, existence/timing is core API but its surface is OSD-governed (ADR 0009)."
  },
  // ---- Plugin registration -------------------------------------------------
  {
    member: "pluginMenuButtons",
    classification: "command",
    commands: [
      "registerSdkChrome",
      "unregisterPlugin",
      "destroyAllPlugins"
    ],
    notes: "Toolbar buttons contributed by plugins; managed only through plugin registration methods."
  },
  {
    member: "pluginPanels",
    classification: "command",
    commands: [
      "registerSdkChrome",
      "unregisterPlugin",
      "destroyAllPlugins"
    ]
  },
  {
    member: "pluginFlyouts",
    classification: "command",
    commands: [
      "registerSdkChrome",
      "unregisterPlugin",
      "destroyAllPlugins"
    ]
  },
  {
    member: "pluginUiState",
    classification: "command",
    commands: [
      "ensurePluginUiState",
      "setPluginOpen",
      "togglePluginOpen",
      "closePluginFlyouts",
      "setPluginTarget",
      "setPluginPosition",
      "updateConfig",
      "registerSdkChrome",
      "unregisterPlugin",
      "destroyAllPlugins"
    ],
    notes: "SvelteMap of per-plugin { open, visible, target, position } UI state, read back through isPluginOpen/getPluginTarget/getPluginPosition. `command`, not `internal`: the viewer's own toolbar button opens and closes a plugin's panel/flyout, so by the parity rule the plugin must be able to observe it (this is what an SDK plugin's PluginContext.surface projects). A TS `private` field, but its contract is public through those accessors."
  },
  // ---- Internal / transitional --------------------------------------------
  {
    member: "annotationEditBus",
    classification: "internal",
    notes: "Transitional per-viewer edit channel shared by OSDViewer and the annotation-editor plugin; mutated by direct reassignment, no stable contract yet (annotation editor migrates in ticket 17)."
  },
  {
    member: "collectionThumbnailHydrationId",
    classification: "internal",
    notes: "Private hydration race guard for collection thumbnails."
  },
  {
    member: "eventTarget",
    classification: "internal",
    notes: "Private EventTarget for the web-component build; null under Svelte usage."
  },
  {
    member: "errorReporter",
    classification: "internal",
    notes: "Private host reporter for the structured `viewererror` channel (ticket 18); wired by the viewer component, null in direct/test use."
  },
  {
    member: "viewerElement",
    classification: "internal",
    notes: "Private reference to the viewer DOM element, used for fullscreen."
  }
], ir = "en", In = (
  /** @type {const} */
  ["en", "de"]
), Bs = "PARAGLIDE_LOCALE", rr = 3456e4, Ns = [
  "cookie",
  "globalVariable",
  "baseLocale"
];
globalThis.__paraglide = {};
let Wt, ss = !1, qs = () => {
  let n;
  for (const e of Ns) {
    if (e === "cookie")
      n = ur();
    else if (e === "baseLocale")
      n = ir;
    else if (e === "globalVariable" && Wt !== void 0)
      n = Wt;
    else if (zs(e) && Jt.has(e)) {
      const t = Jt.get(e);
      if (t) {
        const s = t.getLocale();
        if (s instanceof Promise)
          continue;
        n = s;
      }
    }
    if (n !== void 0) {
      const t = cr(n);
      return ss || (Wt = t, ss = !0, or(t, { reload: !1 })), t;
    }
  }
  throw new Error("No locale found. Read the docs https://inlang.com/m/gerre34r/library-inlang-paraglideJs/errors#no-locale-found");
};
const ar = (n) => {
  window.location.reload();
};
let or = (n, e) => {
  const t = {
    reload: !0,
    ...e
  };
  let s;
  try {
    s = qs();
  } catch {
  }
  const i = [];
  for (const a of Ns)
    if (a === "globalVariable")
      Wt = n;
    else if (a === "cookie") {
      if (typeof document > "u" || typeof window > "u")
        continue;
      const l = `${Bs}=${n}; path=/; max-age=${rr}`;
      document.cookie = l;
    } else {
      if (a === "baseLocale")
        continue;
      if (zs(a) && Jt.has(a)) {
        const l = Jt.get(a);
        if (l) {
          let o = l.setLocale(n);
          o instanceof Promise && (o = o.catch((u) => {
            throw new Error(`Custom strategy "${a}" setLocale failed.`, {
              cause: u
            });
          }), i.push(o));
        }
      }
    }
  const r = () => {
    t.reload && window.location && n !== s && ar();
  };
  if (i.length)
    return Promise.all(i).then(() => {
      r();
    });
  r();
};
function lr(n) {
  return typeof n != "string" ? !1 : n ? In.some((e) => e.toLowerCase() === n.toLowerCase()) : !1;
}
function cr(n) {
  if (typeof n != "string")
    throw new Error(`Invalid locale: ${n}. Expected a string.`);
  const e = n.toLowerCase(), t = In.find((s) => s.toLowerCase() === e);
  if (!t)
    throw new Error(`Invalid locale: ${n}. Expected one of: ${In.join(", ")}`);
  return t;
}
function ur() {
  if (typeof document > "u" || !document.cookie)
    return;
  const n = document.cookie.match(new RegExp(`(^| )${Bs}=([^;]+)`)), e = n == null ? void 0 : n[2];
  if (lr(e))
    return e;
}
const Jt = /* @__PURE__ */ new Map();
function zs(n) {
  return typeof n == "string" && /^custom-[A-Za-z0-9_-]+$/.test(n);
}
function Ln(n, e) {
  if (!n) return "";
  if (typeof n == "string") return n;
  if (typeof n == "object" && !Array.isArray(n)) {
    const t = n;
    if ("@value" in t) {
      const r = t["@value"];
      return Array.isArray(r) && r.length > 0 ? String(r[0]) : r === void 0 ? "" : String(r);
    }
    const s = Object.keys(t), i = (r) => {
      const a = t[r];
      if (a !== void 0)
        return Array.isArray(a) && a.length > 0 ? String(a[0]) : String(a);
    };
    for (const r of ["en", "none"]) {
      const a = i(r);
      if (a !== void 0) return a;
    }
    return s.length > 0 ? i(s[0]) ?? "" : "";
  }
  if (Array.isArray(n) && n.length > 0) {
    if (typeof n[0] == "string") return n[0];
    const t = n, s = (l) => (l == null ? void 0 : l.value) ?? (l == null ? void 0 : l._value) ?? (l == null ? void 0 : l["@value"]), r = ((l) => t.find(
      (o) => o.locale === l || o._locale === l || o.language === l || o["@language"] === l
    ))("en");
    {
      const l = s(r);
      if (l) return l;
    }
    const a = t.find(
      (l) => !l.locale && !l._locale && !l.language && !l["@language"]
    );
    {
      const l = s(a);
      if (l) return l;
    }
    return s(t[0]) ?? "";
  }
  return String(n);
}
function $s(n) {
  return Ln(n);
}
function fr(n) {
  return String(n).trim().toLowerCase();
}
function js(n) {
  const e = (n == null ? void 0 : n.behavior) ?? (n == null ? void 0 : n.viewingHint);
  return e ? (Array.isArray(e) ? e : [e]).map(fr).filter(Boolean) : [];
}
function Hs(n, e) {
  const t = n.id || n["@id"] || "", s = $s(n.label), i = js(n), r = [], a = [];
  if (Array.isArray(n.items))
    for (const l of n.items) {
      if (!l) continue;
      const o = l.type || l["@type"];
      if (o === "Range")
        a.push(Hs(l, e + 1));
      else if (o === "Canvas") {
        const u = (l.id || l["@id"] || "").split("#")[0];
        u && r.push(u);
      } else if (typeof l == "string") {
        const u = l.split("#")[0];
        u && r.push(u);
      }
    }
  return { id: t, label: s, behaviors: i, depth: e, canvasIds: r, children: a };
}
function Qt(n, e, t) {
  const s = n["@id"] || n.id || "", i = $s(n.label), r = js(n), a = [], l = [];
  if (Array.isArray(n.canvases))
    for (const o of n.canvases) {
      const u = (typeof o == "string" ? o : o["@id"] || o.id || "").split("#")[0];
      u && a.push(u);
    }
  if (Array.isArray(n.members))
    for (const o of n.members) {
      const u = o["@type"] || o.type;
      if (u === "sc:Canvas" || u === "Canvas") {
        const f = (o["@id"] || o.id || "").split("#")[0];
        f && a.push(f);
      } else if (u === "sc:Range" || u === "Range") {
        const f = o["@id"] || o.id, h = t.get(f) || o;
        l.push(
          Qt(h, e + 1, t)
        );
      }
    }
  if (Array.isArray(n.ranges))
    for (const o of n.ranges)
      if (typeof o == "string") {
        const u = t.get(o);
        u && l.push(
          Qt(u, e + 1, t)
        );
      } else
        l.push(Qt(o, e + 1, t));
  return { id: s, label: i, behaviors: r, depth: e, canvasIds: a, children: l };
}
function hr(n) {
  if (!n) return [];
  const e = n.structures;
  if (!Array.isArray(e) || e.length === 0) return [];
  const t = e[0].type || e[0]["@type"] || "";
  if (t === "sc:Range" || t.includes("Range") && !!e[0]["@type"]) {
    const i = /* @__PURE__ */ new Map();
    for (const l of e) {
      const o = l["@id"] || l.id;
      o && i.set(o, l);
    }
    const r = e.filter(
      (l) => l.viewingHint === "top"
    );
    return (r.length > 0 ? r : [e[0]]).map((l) => Qt(l, 0, i));
  }
  return e.map((i) => Hs(i, 0));
}
function dr(n) {
  return n.endsWith("/info.json") ? n.slice(0, -10) : n;
}
function Ws(n, e) {
  let t = "";
  try {
    if (t = (n == null ? void 0 : n.profile) || "", typeof t == "object" && t) {
      const a = t;
      t = a.value || a.id || a["@id"] || JSON.stringify(a);
    }
  } catch {
  }
  const s = String(t ?? "").toLowerCase(), i = s.includes("level0") || s.includes("level-0"), r = dr((n == null ? void 0 : n.id) || (n == null ? void 0 : n["@id"]) || "");
  return !i && r ? `${r}/full/${e},/0/default.jpg` : "";
}
function Qs(n, e = 200) {
  if (!n) return "";
  const t = Array.isArray(n) ? n[0] : n;
  if (!t) return "";
  if (typeof t == "string") return t;
  const s = t != null && t.service ? Array.isArray(t.service) ? t.service : [t.service] : [];
  for (const i of s) {
    const r = Ws(i, e);
    if (r) return r;
  }
  return (t == null ? void 0 : t.id) || (t == null ? void 0 : t["@id"]) || "";
}
function gr(n, e = 200) {
  let t = "";
  try {
    const s = n == null ? void 0 : n.thumbnail;
    s && (t = Qs(s, e));
  } catch {
  }
  if (t) return t;
  try {
    const s = er(n);
    if (s && s.length > 0) {
      const i = s[0];
      let r = null, a = es(i);
      if (a && (ts(a) && (a = ns(a)[0] || null), r = Array.isArray(a) ? a[0] : a), r) {
        const o = (() => {
          let u = [];
          return r.service && (u = Array.isArray(r.service) ? r.service : [r.service]), u;
        })();
        if (o.length > 0) {
          const u = Ws(o[0], e);
          if (u)
            return u;
        }
        if (t = r.id || r["@id"] || "", !t) {
          const u = es(i);
          if (u) {
            let f = Array.isArray(u) ? u[0] : u;
            ts(f) && (f = ns(f)[0] || f), t = f.id || f["@id"] || "";
          }
        }
      }
    }
  } catch {
  }
  return t;
}
function Fe(n) {
  return Ln(n);
}
function Ue(n) {
  if (n.thumbnail)
    return Qs(n.thumbnail) || void 0;
}
function $t(n) {
  const e = n == null ? void 0 : n.navDate;
  return typeof e == "string" && e ? e : void 0;
}
function vr(n) {
  if (!n) return !1;
  const e = n.type || n["@type"];
  return e === "Collection" || e === "sc:Collection";
}
function pr(n) {
  return Fe(n == null ? void 0 : n.label) || "Collection";
}
function mr(n) {
  return Ue(n);
}
function yr(n) {
  if (!n) return [];
  const e = [];
  if (Array.isArray(n.items))
    for (const t of n.items) {
      const s = t.type || t["@type"];
      (s === "Manifest" || s === "Collection") && e.push({
        id: t.id || t["@id"] || "",
        type: s === "Collection" ? "Collection" : "Manifest",
        label: Fe(t.label),
        thumbnail: Ue(t),
        navDate: $t(t)
      });
    }
  if (Array.isArray(n.manifests))
    for (const t of n.manifests)
      e.push({
        id: t["@id"] || t.id || "",
        type: "Manifest",
        label: Fe(t.label),
        thumbnail: Ue(t),
        navDate: $t(t)
      });
  if (Array.isArray(n.collections))
    for (const t of n.collections)
      e.push({
        id: t["@id"] || t.id || "",
        type: "Collection",
        label: Fe(t.label),
        thumbnail: Ue(t),
        navDate: $t(t)
      });
  if (Array.isArray(n.members))
    for (const t of n.members) {
      const s = t["@type"] || t.type;
      (s === "sc:Manifest" || s === "Manifest" || s === "sc:Collection" || s === "Collection") && e.push({
        id: t["@id"] || t.id || "",
        type: s === "sc:Collection" || s === "Collection" ? "Collection" : "Manifest",
        label: Fe(t.label),
        thumbnail: Ue(t),
        navDate: $t(t)
      });
    }
  return e;
}
function br(n) {
  return [...n].sort((e, t) => {
    if (e.navDate && t.navDate) {
      const i = e.navDate.localeCompare(t.navDate);
      if (i !== 0) return i;
    } else {
      if (e.navDate)
        return -1;
      if (t.navDate)
        return 1;
    }
    const s = e.label.localeCompare(t.label);
    return s !== 0 ? s : e.id.localeCompare(t.id);
  });
}
function wr(n, e, t) {
  const s = e === void 0 ? "Untitled canvas" : `Canvas ${e + 1}`, i = n == null ? void 0 : n.label;
  if (i) {
    const r = Ln(i);
    if (r)
      return r;
  }
  return s;
}
function Ks(n) {
  return (n == null ? void 0 : n.id) || (n == null ? void 0 : n["@id"]) || null;
}
function is(n) {
  return typeof n == "string" ? n || null : Ks(n);
}
function J(n) {
  return Ks(n) || "";
}
function rs(n) {
  return (n == null ? void 0 : n.id) || (n == null ? void 0 : n["@id"]) || "";
}
function pn(n, e) {
  return e ? n.findIndex(
    (t) => J(t) === e
  ) : -1;
}
function Pn(n) {
  if (!n) return null;
  const e = n.match(
    /xywh=(?:pixel:)?([\d.]+),([\d.]+),([\d.]+),([\d.]+)/
  );
  return e ? [
    Number(e[1]),
    Number(e[2]),
    Number(e[3]),
    Number(e[4])
  ] : null;
}
function Sr(n) {
  const [e] = n.split("#");
  return e || null;
}
function En(n) {
  if (!n) return null;
  if (typeof n == "string")
    return n;
  if (Array.isArray(n)) {
    for (const t of n) {
      const s = En(t);
      if (s)
        return s;
    }
    return null;
  }
  if (typeof n != "object")
    return null;
  const e = n;
  return typeof e.id == "string" ? e.id : typeof e["@id"] == "string" ? e["@id"] : e.source ? En(e.source) : null;
}
function Mn(n) {
  if (!n) return [];
  if (Array.isArray(n))
    return n.flatMap((t) => Mn(t));
  if (typeof n != "object")
    return [];
  const e = n;
  return e.item ? Mn(e.item) : [e];
}
function Cr(n) {
  const e = n.find(
    (s) => (s == null ? void 0 : s.type) === "FragmentSelector" && typeof (s == null ? void 0 : s.value) == "string" && s.value.includes("xywh=")
  );
  if (e)
    return Pn(e.value);
  const t = n.find(
    (s) => typeof (s == null ? void 0 : s.value) == "string" && s.value.includes("xywh=")
  );
  return t ? Pn(t.value) : null;
}
function xn(n) {
  if (!n) return [];
  if (Array.isArray(n))
    return n.flatMap((i) => xn(i));
  const e = En(n), t = typeof n == "object" && n && "selector" in n ? Mn(n.selector) : [], s = Cr(t) || (e ? Pn(e) : null);
  return [
    {
      raw: n,
      targetId: e,
      canvasId: e ? Sr(e) : null,
      selectors: t,
      xywh: s
    }
  ];
}
function as(n) {
  const e = tr(n);
  return e.includes("non-paged") || e.includes("facing-pages");
}
function ue(n, e) {
  const t = [];
  for (let s = 0; s < Math.min(e, n.length); s++) {
    const i = n[s], r = J(i);
    t.push({
      startIndex: s,
      endIndex: s,
      entries: r ? [{ canvasId: r, canvas: i }] : []
    });
  }
  for (let s = e; s < n.length; ) {
    const i = n[s], r = J(i), a = n[s + 1], l = J(a), o = !!a && !!r && !!l && !as(i) && !as(a);
    t.push({
      startIndex: s,
      endIndex: o ? s + 1 : s,
      entries: [
        ...r ? [{ canvasId: r, canvas: i }] : [],
        ...o ? [{ canvasId: l, canvas: a }] : []
      ]
    }), s += o ? 2 : 1;
  }
  return t;
}
function _r({
  canvases: n,
  currentCanvasId: e,
  currentCanvasIndex: t,
  viewingMode: s,
  pagedOffset: i
}) {
  if (!e) return [];
  if (t < 0 || t >= n.length)
    return [];
  const r = [], a = n[t];
  if (!a) return r;
  if (s !== "paged")
    return r.push({
      canvasId: e,
      canvas: a
    }), r;
  const l = ue(n, i).find(
    ({ startIndex: o, endIndex: u }) => t >= o && t <= u
  );
  return (l == null ? void 0 : l.entries) ?? r;
}
const Ar = "http://iiif.io/api/search/1/search", Ir = "http://iiif.io/api/search/0/search";
function jt(n) {
  return n == null || n === "" ? [] : Array.isArray(n) ? [...n] : [n];
}
function Pr(n) {
  const e = String(n).trim().toLowerCase(), t = e.split(/[#/:]/);
  return t[t.length - 1] || e;
}
var He, We, Qe, Ke, Ye, Xe, Ze, Je, et, tt, nt, st, it, rt, at, ot, lt, ct, ut, ft, ht, dt, gt, vt, pt, mt, yt, bt, wt, St, Ct, _t, At, It, Pt, Et, Mt, xt, Rt, Tt, kt, Ot, Dt, Lt, Vt, Ft, Ut, Gt, Bt, ae, ge, ve;
const rn = class rn {
  constructor(e = null, t = null) {
    d(this, He, /* @__PURE__ */ p(null));
    d(this, We, /* @__PURE__ */ p(null));
    d(this, Qe, /* @__PURE__ */ p(!1));
    d(this, Ke, /* @__PURE__ */ p(!1));
    d(this, Ye, /* @__PURE__ */ p(!1));
    d(this, Xe, /* @__PURE__ */ p(!1));
    d(this, Ze, /* @__PURE__ */ p(!1));
    d(this, Je, /* @__PURE__ */ p(!1));
    d(this, et, /* @__PURE__ */ p(!1));
    d(this, tt, /* @__PURE__ */ p(!1));
    d(this, nt, /* @__PURE__ */ p(!1));
    d(this, st, /* @__PURE__ */ p(null));
    d(this, it, /* @__PURE__ */ p("bottom"));
    _(this, "visibleAnnotationIds", new Ae());
    d(this, rt, /* @__PURE__ */ p(!1));
    d(this, at, /* @__PURE__ */ p(null));
    _(this, "userAnnotations", new U());
    _(this, "loadedManifestIds", new Ae());
    d(
      this,
      ot,
      // Error state for tile source fetching and image load failures.
      /* @__PURE__ */ p(null)
    );
    _(this, "selectedChoices", new U());
    d(this, lt, /* @__PURE__ */ p(0));
    d(this, ct, /* @__PURE__ */ p(null));
    d(this, ut, /* @__PURE__ */ p(""));
    d(this, ft, /* @__PURE__ */ p(""));
    d(this, ht, /* @__PURE__ */ p(P([])));
    d(this, dt, /* @__PURE__ */ p(!1));
    _(this, "collectionThumbnailHydrationId", 0);
    d(this, gt, /* @__PURE__ */ p("left-to-right"));
    d(
      this,
      vt,
      // UI Configuration
      /* @__PURE__ */ p(P({}))
    );
    d(this, pt, /* @__PURE__ */ p(null));
    d(this, mt, /* @__PURE__ */ p(void 0));
    d(this, yt, /* @__PURE__ */ p(P(qs())));
    d(
      this,
      bt,
      // Dedicated reactive state for viewingMode to ensure proper reactivity
      // when accessed in $derived expressions (tileSources computation)
      /* @__PURE__ */ p("individuals")
    );
    d(this, wt, /* @__PURE__ */ p(!1));
    d(
      this,
      St,
      // Pairing offset for paged mode: 0 = default (pairs start at 1+2), 1 = shifted (page 1 alone, pairs start at 2+3)
      /* @__PURE__ */ p(1)
    );
    d(this, Ct, /* @__PURE__ */ p(!1));
    d(this, _t, /* @__PURE__ */ p(P({ x: 20, y: 100 })));
    d(this, At, /* @__PURE__ */ p(P({ width: 300, height: 400 })));
    d(this, It, /* @__PURE__ */ p(!1));
    d(this, Pt, /* @__PURE__ */ p(P({ x: 0, y: 0 })));
    d(this, Et, /* @__PURE__ */ p(null));
    d(this, Mt, /* @__PURE__ */ p(null));
    _(this, "eventTarget", null);
    /**
     * Host reporter for the structured `viewererror` channel (ticket 18). Set by
     * `TriiiceratopsViewer.svelte` so state-level actionable failures (search,
     * viewport, content) surface as a typed {@link ViewerError} on the viewer
     * root's `viewererror` event and the `onviewererror` callback instead of
     * only reaching the console. Null in direct/test use → failures are logged
     * through the (silent-by-default) logger only.
     */
    _(this, "errorReporter", null);
    d(
      this,
      xt,
      /**
      * The canvas ID specified by the manifest's `start` property (IIIF
      * Presentation 3.0) or its sequence's `startCanvas` (IIIF Presentation 2.x).
      * Used during auto-selection to navigate to the correct initial canvas.
      * Only set once per manifest load; cleared when a new manifest is set.
      */
      /* @__PURE__ */ p(null)
    );
    /**
     * Reference to the main viewer DOM element.
     * Used for fullscreen toggling.
     */
    _(this, "viewerElement", null);
    d(this, Rt, /* @__PURE__ */ p(""));
    d(this, Tt, /* @__PURE__ */ p(null));
    d(this, kt, /* @__PURE__ */ p(P([])));
    d(this, Ot, /* @__PURE__ */ p(!1));
    d(this, Dt, /* @__PURE__ */ p(!1));
    d(this, Lt, /* @__PURE__ */ p(P([])));
    d(
      this,
      Vt,
      // ==================== PLUGIN STATE ====================
      /** Plugin-registered menu buttons */
      /* @__PURE__ */ p(P([]))
    );
    d(this, Ft, /* @__PURE__ */ p(P([])));
    d(this, Ut, /* @__PURE__ */ p(P([])));
    d(this, Gt, /* @__PURE__ */ p(null));
    d(this, Bt, /* @__PURE__ */ p(P({
      requestEdit: (e) => {
      },
      activeEditAnnotationId: null
    })));
    _(this, "pluginUiState", new U());
    // These are ECMAScript #private fields (not TS `private`) on purpose: they
    // carry no plugin contract and must stay invisible to the state inventory's
    // enumerable-member reflection, so no `state-inventory.ts` entry is needed.
    /**
     * Registered subscription listeners, kept in registration order. Each entry
     * pairs the listener with an optional per-subscription error handler
     * (ticket 09): when the listener throws, the guard routes to `onError` if
     * present so the SDK can attribute the failure to the owning plugin
     * (`pluginerror` phase `subscription`); otherwise it falls back to a console
     * error. Core's own subscriptions register no `onError` and keep the
     * console-error behavior.
     */
    d(this, ae, []);
    /** Disposes the reactive watcher's effect root; null until lazily started. */
    d(this, ge, null);
    /** True once the watcher's priming run has established its dependencies. */
    d(this, ve, !1);
    this.manifestId = e || null, this.canvasId = t || null, this.manifestId && E.fetchManifest(this.manifestId, this.manifestRequestConfig);
  }
  get manifestId() {
    return g(c(this, He));
  }
  set manifestId(e) {
    v(c(this, He), e, !0);
  }
  get canvasId() {
    return g(c(this, We));
  }
  set canvasId(e) {
    v(c(this, We), e, !0);
  }
  get showAnnotations() {
    return g(c(this, Qe));
  }
  set showAnnotations(e) {
    v(c(this, Qe), e, !0);
  }
  get showThumbnailGallery() {
    return g(c(this, Ke));
  }
  set showThumbnailGallery(e) {
    v(c(this, Ke), e, !0);
  }
  get toolbarOpen() {
    return g(c(this, Ye));
  }
  set toolbarOpen(e) {
    v(c(this, Ye), e, !0);
  }
  get isGalleryDockedBottom() {
    return g(c(this, Xe));
  }
  set isGalleryDockedBottom(e) {
    v(c(this, Xe), e, !0);
  }
  get isGalleryDockedRight() {
    return g(c(this, Ze));
  }
  set isGalleryDockedRight(e) {
    v(c(this, Ze), e, !0);
  }
  get isFullScreen() {
    return g(c(this, Je));
  }
  set isFullScreen(e) {
    v(c(this, Je), e, !0);
  }
  get showMetadataPanel() {
    return g(c(this, et));
  }
  set showMetadataPanel(e) {
    v(c(this, et), e, !0);
  }
  get showCanvasInfo() {
    return g(c(this, tt));
  }
  set showCanvasInfo(e) {
    v(c(this, tt), e, !0);
  }
  get showStructuresPanel() {
    return g(c(this, nt));
  }
  set showStructuresPanel(e) {
    v(c(this, nt), e, !0);
  }
  get initialCanvasRegion() {
    return g(c(this, st));
  }
  set initialCanvasRegion(e) {
    v(c(this, st), e, !0);
  }
  get dockSide() {
    return g(c(this, it));
  }
  set dockSide(e) {
    v(c(this, it), e, !0);
  }
  get annotationVisibilityTouched() {
    return g(c(this, rt));
  }
  set annotationVisibilityTouched(e) {
    v(c(this, rt), e, !0);
  }
  get hoveredAnnotationId() {
    return g(c(this, at));
  }
  set hoveredAnnotationId(e) {
    v(c(this, at), e, !0);
  }
  userAnnotationKey(e, t) {
    return `${e}::${t}`;
  }
  /**
   * Replace this viewer's displayed user annotations for one canvas. The
   * supported write path for plugin display sync (ADR 0001, amended): the
   * annotation-editor store calls this after each successful persistence op.
   */
  setUserAnnotations(e, t, s) {
    this.userAnnotations.set(this.userAnnotationKey(e, t), s);
  }
  /** Drop this viewer's displayed user annotations for one canvas. */
  clearUserAnnotations(e, t) {
    const s = this.userAnnotationKey(e, t);
    this.userAnnotations.has(s) && this.userAnnotations.delete(s);
  }
  /** This viewer's displayed user annotations for one canvas (never null). */
  getUserAnnotations(e, t) {
    return this.userAnnotations.get(this.userAnnotationKey(e, t)) ?? [];
  }
  /**
   * Annotations for a canvas: manifest-defined annotations from the shared
   * cache merged with this viewer's own user annotations (ADR 0007). Plugins
   * reach annotation data through this query rather than importing the manifest
   * cache. A `sourceId` restricts the result to one annotation list and skips
   * the user-annotation merge, mirroring the manifest cache's behavior.
   */
  getAnnotations(e, t, s) {
    const i = E.getAnnotations(e, t, s);
    if (s)
      return i;
    const r = this.getUserAnnotations(e, t).map((a) => !a || typeof a != "object" ? a : { ...a, __triiiceratopsAnnotationOrigin: "user" });
    return [...i, ...r];
  }
  /**
   * Canvases of a manifest (from the shared cache). Plugins reach canvas data
   * through this query rather than importing the manifest cache.
   */
  getCanvases(e, t = 0) {
    return E.getCanvases(e, t);
  }
  /**
   * Ensure a canvas's external annotation lists are fetched, then return the
   * per-viewer merged annotations for it. Plugin-facing wrapper over the shared
   * cache's fetch-and-return.
   */
  async ensureCanvasAnnotations(e, t, s) {
    return await E.ensureCanvasAnnotations(e, t, s), this.getAnnotations(e, t, s);
  }
  /** Whether this viewer has finished loading the given manifest. */
  isManifestReady(e) {
    return this.loadedManifestIds.has(e);
  }
  /** Record that a manifest is ready, notifying manifest-readiness subscribers. */
  markManifestReady(e) {
    this.loadedManifestIds.add(e);
  }
  showCurrentCanvasAnnotations() {
    if (this.clearAnnotationVisibility(), !this.manifestId || !this.canvasId)
      return;
    this.getAnnotations(this.manifestId, this.canvasId).forEach((t) => {
      const s = rs(t);
      s && this.visibleAnnotationIds.add(s);
    });
  }
  clearAnnotationVisibility() {
    this.annotationVisibilityTouched = !1, this.visibleAnnotationIds.clear();
  }
  setAnnotationsPanelOpen(e) {
    this.showAnnotations = e, this.clearAnnotationVisibility(), e && this.showCurrentCanvasAnnotations();
  }
  get tileSourceError() {
    return g(c(this, ot));
  }
  set tileSourceError(e) {
    v(c(this, ot), e, !0);
  }
  get selectedSequenceIndex() {
    return g(c(this, lt));
  }
  set selectedSequenceIndex(e) {
    v(c(this, lt), e, !0);
  }
  get collectionId() {
    return g(c(this, ct));
  }
  set collectionId(e) {
    v(c(this, ct), e, !0);
  }
  get collectionLabel() {
    return g(c(this, ut));
  }
  set collectionLabel(e) {
    v(c(this, ut), e, !0);
  }
  get collectionThumbnail() {
    return g(c(this, ft));
  }
  set collectionThumbnail(e) {
    v(c(this, ft), e, !0);
  }
  get collectionItems() {
    return g(c(this, ht));
  }
  set collectionItems(e) {
    v(c(this, ht), e, !0);
  }
  get showCollectionPanel() {
    return g(c(this, dt));
  }
  set showCollectionPanel(e) {
    v(c(this, dt), e, !0);
  }
  get _viewingDirection() {
    return g(c(this, gt));
  }
  set _viewingDirection(e) {
    v(c(this, gt), e, !0);
  }
  get viewingDirection() {
    return this._viewingDirection;
  }
  set viewingDirection(e) {
    this._viewingDirection = e, this.config.viewingDirection = e;
  }
  get config() {
    return g(c(this, vt));
  }
  set config(e) {
    v(c(this, vt), e, !0);
  }
  get searchProvider() {
    return g(c(this, pt));
  }
  set searchProvider(e) {
    v(c(this, pt), e);
  }
  get manifestRequestConfig() {
    return g(c(this, mt));
  }
  set manifestRequestConfig(e) {
    v(c(this, mt), e);
  }
  get activeLocale() {
    return g(c(this, yt));
  }
  set activeLocale(e) {
    v(c(this, yt), e, !0);
  }
  get showToggle() {
    return this.config.showToggle ?? !0;
  }
  get showCanvasNav() {
    return this.config.showCanvasNav ?? !0;
  }
  get showZoomControls() {
    return this.config.showZoomControls ?? !0;
  }
  get preserveCanvasScale() {
    return this.config.preserveCanvasScale ?? !1;
  }
  /**
   * `gallery.size` — the docked band's height or the docked rail's width, and the
   * knob every thumbnail dimension is derived from. See `galleryGeometry`.
   *
   * Not named `gallerySize`: that is already the floating window's width and
   * height, which is a different thing entirely.
   */
  get galleryExtent() {
    var e;
    return ((e = this.config.gallery) == null ? void 0 : e.size) ?? 100;
  }
  get _viewingMode() {
    return g(c(this, bt));
  }
  set _viewingMode(e) {
    v(c(this, bt), e, !0);
  }
  get _viewingModeUserConfigured() {
    return g(c(this, wt));
  }
  set _viewingModeUserConfigured(e) {
    v(c(this, wt), e, !0);
  }
  get viewingMode() {
    return this._viewingMode;
  }
  set viewingMode(e) {
    this._viewingMode = e, this.config.viewingMode = e;
  }
  get pagedOffset() {
    return g(c(this, St));
  }
  set pagedOffset(e) {
    v(c(this, St), e, !0);
  }
  get galleryExpanded() {
    return g(c(this, Ct));
  }
  set galleryExpanded(e) {
    v(c(this, Ct), e, !0);
  }
  get galleryPosition() {
    return g(c(this, _t));
  }
  set galleryPosition(e) {
    v(c(this, _t), e, !0);
  }
  get gallerySize() {
    return g(c(this, At));
  }
  set gallerySize(e) {
    v(c(this, At), e, !0);
  }
  get isGalleryDragging() {
    return g(c(this, It));
  }
  set isGalleryDragging(e) {
    v(c(this, It), e, !0);
  }
  get galleryDragOffset() {
    return g(c(this, Pt));
  }
  set galleryDragOffset(e) {
    v(c(this, Pt), e, !0);
  }
  get dragOverSide() {
    return g(c(this, Et));
  }
  set dragOverSide(e) {
    v(c(this, Et), e, !0);
  }
  get galleryCenterPanelRect() {
    return g(c(this, Mt));
  }
  set galleryCenterPanelRect(e) {
    v(c(this, Mt), e, !0);
  }
  setEventTarget(e) {
    this.eventTarget = e;
  }
  /** Wire the `viewererror` reporter (see {@link errorReporter}). */
  setErrorReporter(e) {
    this.errorReporter = e;
  }
  /** Deliver a structured viewer failure to the host, if a reporter is wired. */
  reportError(e) {
    var t;
    (t = this.errorReporter) == null || t.call(this, e);
  }
  /**
   * Get current state as a plain object snapshot.
   * Safe to use outside Svelte's reactive system.
   * NOTE: We calculate currentCanvasIndex inline to avoid triggering the canvases getter
   * which can cause infinite loops when it auto-sets canvasId.
   */
  getSnapshot() {
    let e = -1;
    if (this.manifestId && this.canvasId) {
      const t = E.getCanvases(this.manifestId);
      e = pn(t, this.canvasId);
    }
    return {
      manifestId: this.manifestId,
      canvasId: this.canvasId,
      currentCanvasIndex: e,
      showAnnotations: this.showAnnotations,
      showInformationPanel: this.showMetadataPanel,
      showThumbnailGallery: this.showThumbnailGallery,
      showSearchPanel: this.showSearchPanel,
      showStructuresPanel: this.showStructuresPanel,
      toolbarOpen: this.toolbarOpen,
      searchQuery: this.searchQuery,
      isFullScreen: this.isFullScreen,
      dockSide: this.dockSide,
      viewingMode: this.viewingMode,
      viewingDirection: this.viewingDirection,
      preserveCanvasScale: this.preserveCanvasScale,
      galleryExpanded: this.galleryExpanded,
      galleryPosition: this.galleryPosition,
      gallerySize: this.gallerySize
    };
  }
  /**
   * Dispatch a state change event to the web component.
   * No-op if eventTarget is null (Svelte component usage).
   *
   * Uses queueMicrotask to dispatch asynchronously AFTER the current
   * reactive cycle completes, preventing infinite update loops.
   */
  dispatchStateChange(e = "statechange") {
    this.eventTarget && queueMicrotask(() => {
      var t;
      (t = this.eventTarget) == null || t.dispatchEvent(new CustomEvent(e, { detail: this.getSnapshot(), bubbles: !0, composed: !0 }));
    });
  }
  /**
   * The active manifest's cache entry — `{ json, error, isFetching }`.
   *
   * `json` is the **raw IIIF Manifest JSON as fetched**, v2 or v3 as the
   * publisher authored it. This replaced the removed `manifest` getter, which
   * handed out a `manifesto.js` object; there is deliberately no same-named
   * accessor returning raw JSON in its place, so a consumer that used it
   * fails at build time rather than at runtime.
   */
  get manifestEntry() {
    return this.manifestId ? E.getManifestEntry(this.manifestId) : null;
  }
  get canvases() {
    return this.manifestId ? E.getCanvases(this.manifestId, this.selectedSequenceIndex) : [];
  }
  get sequenceCount() {
    return this.manifestId ? E.getSequenceCount(this.manifestId) : 0;
  }
  get currentCanvasIndex() {
    return this.canvasId ? pn(this.canvases, this.canvasId) : -1;
  }
  getCurrentPagedCanvasGroupIndex() {
    return this.viewingMode !== "paged" || this.currentCanvasIndex < 0 ? -1 : ue(this.canvases, this.pagedOffset).findIndex(({ startIndex: t, endIndex: s }) => this.currentCanvasIndex >= t && this.currentCanvasIndex <= s);
  }
  get hasNext() {
    if (this.currentCanvasIndex < 0)
      return !1;
    if (this.viewingMode === "paged") {
      const e = this.getCurrentPagedCanvasGroupIndex(), t = ue(this.canvases, this.pagedOffset);
      return e >= 0 && e < t.length - 1;
    } else
      return this.currentCanvasIndex < this.canvases.length - 1;
  }
  get hasPrevious() {
    return this.currentCanvasIndex < 0 ? !1 : this.viewingMode === "paged" ? this.getCurrentPagedCanvasGroupIndex() > 0 : this.currentCanvasIndex > 0;
  }
  nextCanvas() {
    var e, t;
    if (this.hasNext)
      if (this.viewingMode === "paged") {
        const i = (t = (e = ue(this.canvases, this.pagedOffset)[this.getCurrentPagedCanvasGroupIndex() + 1]) == null ? void 0 : e.entries[0]) == null ? void 0 : t.canvasId;
        i && this.setCanvas(i);
      } else {
        const s = this.currentCanvasIndex + 1, i = this.canvases[s], r = J(i);
        r && this.setCanvas(r);
      }
  }
  previousCanvas() {
    var e, t;
    if (this.hasPrevious)
      if (this.viewingMode === "paged") {
        const i = (t = (e = ue(this.canvases, this.pagedOffset)[this.getCurrentPagedCanvasGroupIndex() - 1]) == null ? void 0 : e.entries[0]) == null ? void 0 : t.canvasId;
        i && this.setCanvas(i);
      } else {
        const s = this.currentCanvasIndex - 1, i = this.canvases[s], r = J(i);
        r && this.setCanvas(r);
      }
  }
  zoomIn() {
    this.osdViewer && this.osdViewer.viewport && (this.osdViewer.viewport.zoomBy(1.2), this.osdViewer.viewport.applyConstraints());
  }
  zoomOut() {
    this.osdViewer && this.osdViewer.viewport && (this.osdViewer.viewport.zoomBy(0.8), this.osdViewer.viewport.applyConstraints());
  }
  setSearchProvider(e) {
    this.searchProvider = e;
  }
  setManifestRequestConfig(e) {
    this.manifestRequestConfig = e;
  }
  async setManifestData(e, t, s) {
    this.startCanvasId = null, this.selectedSequenceIndex = 0, await E.registerManifest(e, t), this.manifestId = e, this.markManifestReady(e), s != null && s.canvasId && this.setCanvas(s.canvasId), this._applyManifestSettings(e), this.ensureInitialCanvasSelection();
  }
  get startCanvasId() {
    return g(c(this, xt));
  }
  set startCanvasId(e) {
    v(c(this, xt), e, !0);
  }
  async setManifest(e, t) {
    this.manifestRequestConfig = t == null ? void 0 : t.requestConfig;
    let s;
    try {
      s = await E.fetchResource(e, this.manifestRequestConfig);
    } catch {
      this.startCanvasId = null, this.selectedSequenceIndex = 0, await E.fetchManifest(e, this.manifestRequestConfig), this.manifestId = e, this.markManifestReady(e), t != null && t.canvasId && this.setCanvas(t.canvasId), this._applyManifestSettings(e), this.ensureInitialCanvasSelection(), this.dispatchStateChange("manifestchange");
      return;
    }
    if (vr(s)) {
      this.collectionId = e, this.collectionLabel = pr(s), this.collectionThumbnail = mr(s) || "", this.collectionItems = br(yr(s));
      const i = this.collectionItems.find((r) => r.type === "Manifest");
      i && await this._loadManifest(i.id, t == null ? void 0 : t.canvasId), this.hydrateCollectionItemThumbnails(e), this.dispatchStateChange("manifestchange");
      return;
    }
    this.collectionId = null, this.collectionLabel = "", this.collectionThumbnail = "", this.collectionItems = [], this.collectionThumbnailHydrationId += 1, this.startCanvasId = null, await E.registerManifest(e, s), this.manifestId = e, this.markManifestReady(e), t != null && t.canvasId && this.setCanvas(t.canvasId), this._applyManifestSettings(e), this.ensureInitialCanvasSelection(), this.dispatchStateChange("manifestchange");
  }
  /**
   * Load a manifest by ID within the current collection context,
   * or directly if no collection is active.
   */
  async loadCollectionManifest(e) {
    await this._loadManifest(e), this.dispatchStateChange("manifestchange");
  }
  /**
   * Internal: load a manifest by ID and apply its settings.
   */
  async _loadManifest(e, t) {
    this.startCanvasId = null, this.selectedSequenceIndex = 0, await E.fetchManifest(e, this.manifestRequestConfig), this.manifestId = e, this.markManifestReady(e), t && this.setCanvas(t), this._applyManifestSettings(e), this.ensureInitialCanvasSelection();
  }
  ensureInitialCanvasSelection() {
    const e = this.canvases;
    if (!e.length || this.canvasId && pn(e, this.canvasId) >= 0)
      return;
    if (this.startCanvasId) {
      this.setCanvas(this.startCanvasId);
      return;
    }
    const t = J(e[0]);
    t && this.setCanvas(t);
  }
  async hydrateCollectionItemThumbnails(e) {
    const t = ++this.collectionThumbnailHydrationId, s = this.collectionItems.filter((i) => i.type === "Manifest" && !i.thumbnail);
    await Promise.allSettled(s.map(async (i) => {
      if (await E.fetchManifest(i.id, this.manifestRequestConfig), this.collectionId !== e || this.collectionThumbnailHydrationId !== t)
        return;
      const r = E.getCanvases(i.id)[0], a = r ? gr(r) : "";
      a && (i.thumbnail = a);
    }));
  }
  /**
   * Apply manifest-level settings (start canvas, viewing direction, behavior).
   */
  _applyManifestSettings(e) {
    var r;
    const t = (r = E.getManifestEntry(e)) == null ? void 0 : r.json;
    if (!t) return;
    const s = Array.isArray(t == null ? void 0 : t.sequences) ? t.sequences[0] : void 0;
    try {
      let a = null;
      if (t != null && t.start && (a = is(t.start)), a || (a = is(s == null ? void 0 : s.startCanvas)), a) {
        const l = a.split("#")[0];
        E.getCanvases(e).some((f) => J(f) === l) && (this.startCanvasId = l);
      }
    } catch {
    }
    let i = null;
    try {
      s != null && s.viewingDirection && (i = s.viewingDirection), !i && (t != null && t.viewingDirection) && (i = t.viewingDirection);
    } catch {
    }
    if (i && [
      "left-to-right",
      "right-to-left",
      "top-to-bottom",
      "bottom-to-top"
    ].includes(i) ? this.viewingDirection = i : this.viewingDirection = "left-to-right", !this._viewingModeUserConfigured) {
      let a = [];
      try {
        a = [
          ...jt(t == null ? void 0 : t.behavior),
          ...jt(s == null ? void 0 : s.behavior)
        ], a.length === 0 && (a = jt(s == null ? void 0 : s.viewingHint)), a.length === 0 && (a = jt(t == null ? void 0 : t.viewingHint)), a = a.map(Pr);
      } catch {
      }
      a.includes("continuous") ? this.viewingMode = "continuous" : a.includes("individuals") || a.includes("non-paged") ? this.viewingMode = "individuals" : a.includes("paged") || a.includes("facing-pages") ? this.viewingMode = "paged" : this.viewingMode = "individuals";
    }
  }
  setCanvas(e) {
    this.canvasId = e, this.tileSourceError = null, this.showAnnotations && this.clearAnnotationVisibility(), this.dispatchStateChange("canvaschange");
  }
  selectChoice(e, t) {
    this.selectedChoices.set(e, t), this.dispatchStateChange("choicechange");
  }
  getSelectedChoice(e) {
    return this.selectedChoices.get(e);
  }
  updateConfig(e) {
    var s;
    const t = this.config;
    if (this.config = e, e.toolbarOpen !== void 0 && (this.toolbarOpen = e.toolbarOpen), e.viewingMode && (this.viewingMode = e.viewingMode, this._viewingModeUserConfigured = !0), e.viewingDirection && (this.viewingDirection = e.viewingDirection), e.pagedViewOffset !== void 0 && (this.pagedOffset = e.pagedViewOffset ? 1 : 0), e.gallery && (e.gallery.open !== void 0 && (this.showThumbnailGallery = e.gallery.open), e.gallery.dockPosition !== void 0 && (this.dockSide = e.gallery.dockPosition), e.gallery.width !== void 0 && (this.gallerySize.width = e.gallery.width), e.gallery.height !== void 0 && (this.gallerySize.height = e.gallery.height), e.gallery.x !== void 0 && (this.galleryPosition.x = e.gallery.x), e.gallery.y !== void 0 && (this.galleryPosition.y = e.gallery.y), e.gallery.expanded !== void 0 && (this.galleryExpanded = e.gallery.expanded, e.gallery.expanded && (this.showThumbnailGallery = !0))), e.search) {
      e.search.open !== void 0 && (this.showSearchPanel = e.search.open);
      const i = e.search.query, r = (s = t.search) == null ? void 0 : s.query;
      i !== void 0 && i !== r && i !== this.searchQuery && this._performSearch(i);
    }
    e.annotations && e.annotations.open !== void 0 && (e.annotations.open !== this.showAnnotations ? this.setAnnotationsPanelOpen(e.annotations.open) : this.showAnnotations = e.annotations.open), e.information && e.information.open !== void 0 && (this.showMetadataPanel = e.information.open), e.structures && e.structures.open !== void 0 && (this.showStructuresPanel = e.structures.open), e.collection && e.collection.open !== void 0 && (this.showCollectionPanel = e.collection.open), this.applyPluginUiConfigToAll();
  }
  toggleAnnotations() {
    this.setAnnotationsPanelOpen(!this.showAnnotations), this.dispatchStateChange();
  }
  toggleToolbar() {
    this.toolbarOpen = !this.toolbarOpen, this.dispatchStateChange();
  }
  toggleThumbnailGallery() {
    this.showThumbnailGallery = !this.showThumbnailGallery, this.showThumbnailGallery || (this.galleryExpanded = !1), this.dispatchStateChange();
  }
  setViewerElement(e) {
    this.viewerElement = e;
  }
  /**
   * Resolve the viewer's style root — where a plugin's global CSS must be
   * installed (ticket 08's `PluginStyleService`). For a light-DOM (Svelte)
   * viewer this is the owning `Document`; for the Web Component it is the
   * shadow root, so plugin styles reach the shadow-scoped tree. Derived from
   * the mount element captured by {@link setViewerElement} via `getRootNode()`;
   * `null` before the element is mounted.
   */
  getStyleRoot() {
    var t;
    const e = (t = this.viewerElement) == null ? void 0 : t.getRootNode();
    return e && (e.nodeType === 9 || e.nodeType === 11) ? e : null;
  }
  toggleFullScreen() {
    if (document.fullscreenElement)
      document.exitFullscreen();
    else {
      const e = this.viewerElement || document.getElementById("triiiceratops-viewer");
      e ? e.requestFullscreen().catch((t) => {
        this.reportError({
          severity: "warning",
          scope: "viewport",
          code: "fullscreen-failed",
          message: "Fullscreen request failed.",
          error: t
        });
      }) : this.reportError({
        severity: "warning",
        scope: "viewport",
        code: "fullscreen-element-missing",
        message: "Cannot toggle fullscreen: viewer element not found."
      });
    }
  }
  toggleMetadataPanel() {
    this.showMetadataPanel = !this.showMetadataPanel, this.dispatchStateChange();
  }
  toggleCanvasInfo() {
    this.showCanvasInfo = !this.showCanvasInfo;
  }
  setSequenceIndex(e) {
    const t = Math.max(0, this.sequenceCount - 1);
    this.selectedSequenceIndex = Math.max(0, Math.min(e, t));
    const i = this.canvases[0];
    this.canvasId = i && (i.id || i["@id"]) || null, this.startCanvasId = null, this.dispatchStateChange();
  }
  setInitialCanvasRegion(e) {
    this.initialCanvasRegion = e;
  }
  toggleStructuresPanel() {
    this.showStructuresPanel = !this.showStructuresPanel, this.dispatchStateChange();
  }
  toggleCollectionPanel() {
    this.showCollectionPanel = !this.showCollectionPanel, this.dispatchStateChange();
  }
  /** Whether the viewer is currently showing a collection */
  get hasCollection() {
    return this.collectionId !== null && this.collectionItems.length > 0;
  }
  /**
   * Parsed IIIF structures (ranges / table of contents) from the current manifest.
   * Returns an empty array if no structures exist.
   */
  get structures() {
    var t;
    const e = (t = this.manifestEntry) == null ? void 0 : t.json;
    return e ? hr(e) : [];
  }
  setViewingMode(e) {
    var t, s;
    if (this.viewingMode = e, e === "paged") {
      const i = this.getCurrentPagedCanvasGroupIndex(), r = i >= 0 ? (s = (t = ue(this.canvases, this.pagedOffset)[i]) == null ? void 0 : t.entries[0]) == null ? void 0 : s.canvasId : null;
      r && this.canvasId !== r && this.setCanvas(r);
    }
    this.dispatchStateChange();
  }
  togglePagedOffset() {
    var s, i;
    this.pagedOffset = this.pagedOffset === 0 ? 1 : 0, this.config.pagedViewOffset = this.pagedOffset === 1;
    const e = this.getCurrentPagedCanvasGroupIndex(), t = e >= 0 ? (i = (s = ue(this.canvases, this.pagedOffset)[e]) == null ? void 0 : s.entries[0]) == null ? void 0 : i.canvasId : null;
    t && this.canvasId !== t && this.setCanvas(t), this.dispatchStateChange();
  }
  get searchQuery() {
    return g(c(this, Rt));
  }
  set searchQuery(e) {
    v(c(this, Rt), e, !0);
  }
  get pendingSearchQuery() {
    return g(c(this, Tt));
  }
  set pendingSearchQuery(e) {
    v(c(this, Tt), e, !0);
  }
  get searchResults() {
    return g(c(this, kt));
  }
  set searchResults(e) {
    v(c(this, kt), e, !0);
  }
  get isSearching() {
    return g(c(this, Ot));
  }
  set isSearching(e) {
    v(c(this, Ot), e, !0);
  }
  get showSearchPanel() {
    return g(c(this, Dt));
  }
  set showSearchPanel(e) {
    v(c(this, Dt), e, !0);
  }
  toggleSearchPanel() {
    this.showSearchPanel = !this.showSearchPanel, this.showSearchPanel || (this.searchAnnotations = []), this.dispatchStateChange();
  }
  get searchAnnotations() {
    return g(c(this, Lt));
  }
  set searchAnnotations(e) {
    v(c(this, Lt), e, !0);
  }
  get currentCanvasSearchAnnotations() {
    var e;
    if (!this.canvasId) return [];
    if (this.viewingMode === "paged") {
      const t = _r({
        canvases: this.canvases,
        currentCanvasId: this.canvasId,
        currentCanvasIndex: this.currentCanvasIndex,
        viewingMode: this.viewingMode,
        pagedOffset: this.pagedOffset
      });
      if (!t.length)
        return [];
      const [s, i] = t;
      let r = this.searchAnnotations.filter((a) => a.canvasId === s.canvasId);
      if (i) {
        const o = (((e = s.canvas) == null ? void 0 : e.width) ?? 0) * 1.025, f = this.searchAnnotations.filter((h) => h.canvasId === i.canvasId).map((h) => {
          const y = h.on.split("#xywh="), m = y[1].split(",").map(Number), b = m[0] + o;
          return {
            ...h,
            on: `${y[0]}#xywh=${b},${m[1]},${m[2]},${m[3]}`
          };
        });
        r = r.concat(f);
      }
      return r;
    } else
      return this.searchAnnotations.filter((t) => t.canvasId === this.canvasId);
  }
  async search(e) {
    this.dispatchStateChange(), await this._performSearch(e), this.dispatchStateChange();
  }
  async _performSearch(e) {
    var t;
    if (e.trim()) {
      this.isSearching = !0, this.searchQuery = e, this.searchResults = [];
      try {
        const s = (t = this.manifestEntry) == null ? void 0 : t.json;
        if (!s) {
          An.debug("Manifest not loaded, deferring search:", e), this.pendingSearchQuery = e;
          return;
        }
        if (this.searchProvider && this.manifestId) {
          this.searchResults = await this.searchProvider(e, {
            manifestId: this.manifestId,
            manifestJson: s,
            canvases: this.canvases,
            canvasId: this.canvasId
          }), this.searchAnnotations = this.buildSearchAnnotations(this.searchResults);
          return;
        }
        const i = this.discoverSearchService(s);
        if (!i) {
          An.warn("No IIIF search service found in manifest"), this.reportError({
            severity: "warning",
            scope: "search",
            code: "search-service-missing",
            message: "No IIIF search service found in manifest.",
            detail: { query: e }
          }), this.isSearching = !1;
          return;
        }
        const r = `${i.serviceId}?q=${encodeURIComponent(e)}`, a = await fetch(r);
        if (!a.ok) throw new Error("Search request failed");
        const l = await a.json();
        i.version === 2 ? this.searchResults = this.parseV2SearchResponse(l) : this.searchResults = this.parseLegacySearchResponse(l), this.searchAnnotations = this.buildSearchAnnotations(this.searchResults);
      } catch (s) {
        this.reportError({
          severity: "error",
          scope: "search",
          code: "search-failed",
          message: "Search request failed.",
          error: s,
          detail: { query: e }
        }), this.isSearching = !1;
      } finally {
        this.pendingSearchQuery || (this.isSearching = !1);
      }
    }
  }
  /**
   * Discover a IIIF Content Search service from raw manifest JSON.
   *
   * Reads `service` and `services` — either may be a bare object rather than
   * an array — and matches search v0, v1 and v2 on `profile` or
   * `type`/`@type`. The same JSON serves IIIF Presentation 2.x (`@type`,
   * `@id`) and 3.0 (`type`, `id`). v2 is preferred when several are present.
   *
   * Total: every access is guarded, so no manifest shape makes this throw.
   */
  discoverSearchService(e) {
    const t = (o) => Array.isArray(o) ? o : o ? [o] : [], s = [
      ...t(e == null ? void 0 : e.service),
      ...t(e == null ? void 0 : e.services)
    ];
    let i = null, r = null, a = null, l = null;
    for (const o of s) {
      if (!o || typeof o != "object") continue;
      const u = o.type || o["@type"], f = o.profile ?? o["dcterms:conformsTo"], h = Array.isArray(f) ? f[0] : f;
      u === "SearchService2" ? i = o : !r && h === Ar ? r = o : !a && h === Ir ? a = o : !l && u === "SearchService1" && (l = o);
    }
    return i ? { version: 2, serviceId: i.id || i["@id"] } : r ? { version: 1, serviceId: r.id || r["@id"] } : a ? { version: 0, serviceId: a.id || a["@id"] } : l ? {
      version: 1,
      serviceId: l.id || l["@id"]
    } : null;
  }
  /** Helper to unescape HTML-encoded mark tags */
  decodeMark(e) {
    return e ? e.replace(/&lt;mark&gt;/g, "<mark>").replace(/&lt;\/mark&gt;/g, "</mark>") : "";
  }
  /**
   * The display label for a canvas in a search-result group.
   *
   * Delegates to the shared helper rather than repeating the chain. The
   * private copy this replaced read `getLabel()` first and, failing that,
   * only a string or a `[{value}]` array — so a raw IIIF v3 canvas, whose
   * `label` is a language map, fell through to "Canvas N" once canvases
   * stopped being library objects.
   */
  resolveCanvasLabel(e, t) {
    return wr(e, t);
  }
  /** Ensure a canvas group exists in the map and return it */
  getOrCreateCanvasGroup(e, t) {
    if (!e.has(t)) {
      const s = this.canvases[t];
      e.set(t, {
        canvasIndex: t,
        canvasLabel: this.resolveCanvasLabel(s, t),
        hits: []
      });
    }
    return e.get(t);
  }
  getSearchCanvasIndexes() {
    const e = new U();
    return this.canvases.forEach((t, s) => {
      const i = J(t);
      i && !e.has(i) && e.set(i, s);
    }), e;
  }
  resolveSearchTargets(e, t) {
    let s = -1, i = null;
    const r = [];
    for (const a of xn(e)) {
      const l = a.canvasId ? t.get(a.canvasId) : void 0;
      l !== void 0 && (s === -1 && (s = l), a.xywh && (r.push(a.xywh), i || (i = a.xywh)));
    }
    return { canvasIndex: s, bounds: i, allBounds: r };
  }
  /**
   * Parse a IIIF Content Search API v0/v1 response.
   * Handles both "hits" format (with before/match/after) and "resources"-only format.
   */
  parseLegacySearchResponse(e) {
    const t = e.resources || [], s = this.getSearchCanvasIndexes(), i = new U();
    for (const a of t)
      for (const l of [a["@id"], a.id])
        l && !i.has(l) && i.set(l, a);
    const r = new U();
    if (e.hits)
      for (const a of e.hits) {
        const o = (a.annotations || []).map((y) => {
          var m;
          return (m = i.get(y)) == null ? void 0 : m.on;
        }).filter(Boolean), { canvasIndex: u, bounds: f, allBounds: h } = this.resolveSearchTargets(o, s);
        u >= 0 && this.getOrCreateCanvasGroup(r, u).hits.push({
          type: "hit",
          before: this.decodeMark(a.before),
          match: this.decodeMark(a.match),
          after: this.decodeMark(a.after),
          bounds: f,
          allBounds: h
        });
      }
    else if (t.length > 0)
      for (const a of t) {
        const l = xn(a.on), o = l.find((f) => f.canvasId);
        if (!(o != null && o.canvasId))
          continue;
        const u = s.get(o.canvasId) ?? -1;
        if (u >= 0) {
          const f = l.map((y) => y.xywh).filter((y) => y !== null);
          this.getOrCreateCanvasGroup(r, u).hits.push({
            type: "resource",
            match: this.decodeMark(a.resource && a.resource.chars ? a.resource.chars : a.chars || ""),
            bounds: f[0] || null,
            allBounds: f
          });
        }
      }
    return Array.from(r.values()).sort((a, l) => a.canvasIndex - l.canvasIndex);
  }
  /**
   * Parse a IIIF Content Search API v2 response.
   * v2 returns an AnnotationPage with `items` (W3C Annotations) and optional
   * `annotations` containing contextualizing/highlighting info via TextQuoteSelector.
   */
  parseV2SearchResponse(e) {
    const t = e.items || [], s = this.getSearchCanvasIndexes(), i = new U(), r = new U();
    if (e.annotations) {
      const a = Array.isArray(e.annotations) ? e.annotations : [e.annotations];
      for (const l of a) {
        const o = l.items || [];
        for (const u of o) {
          const f = Array.isArray(u.target) ? u.target : [u.target];
          for (const h of f) {
            if (!h || typeof h == "string") continue;
            const y = h.source;
            if (!y) continue;
            const m = Array.isArray(h.selector) ? h.selector : h.selector ? [h.selector] : [];
            for (const b of m)
              b.type === "TextQuoteSelector" && (r.has(y) || r.set(y, {
                before: b.prefix || "",
                match: b.exact || "",
                after: b.suffix || ""
              }));
          }
        }
      }
    }
    for (const a of t) {
      const l = a.id || a["@id"], { canvasIndex: o, bounds: u, allBounds: f } = this.resolveSearchTargets(a.target, s);
      if (o < 0) continue;
      let h = "";
      if (a.body) {
        const b = Array.isArray(a.body) ? a.body[0] : a.body;
        b && typeof b == "object" ? h = b.value || "" : typeof b == "string" && (h = b);
      }
      const y = this.getOrCreateCanvasGroup(i, o), m = r.get(l);
      m ? y.hits.push({
        type: "hit",
        before: this.decodeMark(m.before),
        match: this.decodeMark(m.match),
        after: this.decodeMark(m.after),
        bounds: u,
        allBounds: f
      }) : y.hits.push({
        type: "resource",
        match: this.decodeMark(h),
        bounds: u,
        allBounds: f
      });
    }
    return Array.from(i.values()).sort((a, l) => a.canvasIndex - l.canvasIndex);
  }
  buildSearchAnnotations(e) {
    let t = 0;
    return e.flatMap((s) => {
      const i = this.canvases[s.canvasIndex], r = J(i);
      return r ? s.hits.flatMap((a) => (a.allBounds && a.allBounds.length > 0 ? a.allBounds : a.bounds ? [a.bounds] : []).map((o) => ({
        "@id": `urn:search-hit:${t++}`,
        "@type": "oa:Annotation",
        motivation: "sc:painting",
        on: `${r}#xywh=${o.join(",")}`,
        canvasId: r,
        resource: { "@type": "cnt:ContentAsText", chars: a.match },
        isSearchHit: !0
      }))) : [];
    });
  }
  // ==================== PARITY COMMANDS (ticket 03) ====================
  // Supported mutation methods for viewer behaviors the chrome previously
  // performed only through direct field assignment. Added for the parity rule
  // (see state-inventory.ts). Core components keep their direct writes; those
  // remain a legitimate internal escape hatch and notification completeness is
  // ticket 04's reactivity-driven concern (ADR 0008). These commands therefore
  // mirror the components' direct-assignment behavior and, like those chrome
  // interactions, do not dispatch legacy web-component events.
  /** Set (or clear, with null) the currently hovered annotation id. */
  setHoveredAnnotationId(e) {
    this.hoveredAnnotationId = e;
  }
  /**
   * Show or hide a single annotation in the read-only overlay, marking
   * visibility as user-touched so the panel keeps the manual selection.
   */
  setAnnotationVisible(e, t) {
    this.annotationVisibilityTouched = !0, t ? this.visibleAnnotationIds.add(e) : this.visibleAnnotationIds.delete(e);
  }
  /**
   * Show or hide every annotation on the active canvas at once, marking
   * visibility as user-touched. Mirrors the annotation panel's "toggle all".
   */
  setAllAnnotationsVisible(e) {
    if (this.annotationVisibilityTouched = !0, this.visibleAnnotationIds.clear(), !e || !this.manifestId || !this.canvasId)
      return;
    this.getAnnotations(this.manifestId, this.canvasId).forEach((s) => {
      const i = rs(s);
      i && this.visibleAnnotationIds.add(i);
    });
  }
  /**
   * Expand the gallery to fill the viewer's center column as a thumbnail
   * grid, or collapse it back to its docked strip / floating window.
   *
   * Expanding implies opening: an expanded-but-hidden gallery is not a state
   * the UI can reach, so maintaining that invariant is why this is a command
   * rather than a field write. Collapsing leaves the gallery open.
   */
  setGalleryExpanded(e) {
    this.galleryExpanded = e, e && (this.showThumbnailGallery = !0), this.dispatchStateChange();
  }
  /** Flip the gallery between expanded and collapsed (see {@link setGalleryExpanded}). */
  toggleGalleryExpanded() {
    this.setGalleryExpanded(!this.galleryExpanded);
  }
  /** Move the floating (undocked) thumbnail gallery to an absolute position. */
  setGalleryPosition(e) {
    this.galleryPosition = e;
  }
  /** Resize the floating (undocked) thumbnail gallery. */
  setGallerySize(e) {
    this.gallerySize = e;
  }
  /**
   * Dock the thumbnail gallery to a side ('top' | 'bottom' | 'left' |
   * 'right') or float it ('none'), keeping the derived docked flags in sync.
   * Maintaining that invariant is why this is a command, not a field write.
   */
  setDockSide(e) {
    this.dockSide = e, this.isGalleryDockedBottom = e === "bottom", this.isGalleryDockedRight = e === "right";
  }
  get pluginMenuButtons() {
    return g(c(this, Vt));
  }
  set pluginMenuButtons(e) {
    v(c(this, Vt), e, !0);
  }
  get pluginPanels() {
    return g(c(this, Ft));
  }
  set pluginPanels(e) {
    v(c(this, Ft), e, !0);
  }
  get pluginFlyouts() {
    return g(c(this, Ut));
  }
  set pluginFlyouts(e) {
    v(c(this, Ut), e, !0);
  }
  get osdViewer() {
    return g(c(this, Gt));
  }
  set osdViewer(e) {
    v(c(this, Gt), e);
  }
  get annotationEditBus() {
    return g(c(this, Bt));
  }
  set annotationEditBus(e) {
    v(c(this, Bt), e, !0);
  }
  getPluginUiConfig(e) {
    var t;
    return (t = this.config.plugins) == null ? void 0 : t[e];
  }
  /**
   * Seed a plugin's UI state from its authored defaults plus any
   * `config.plugins[pluginId]` override, or re-apply the config to an existing
   * entry. Idempotent.
   *
   * Public because the SDK activation path needs the entry to EXIST before the
   * plugin mounts: core runs `view.mount` before {@link registerSdkChrome} (to
   * fail closed — a failed mount renders no button), and the plugin's
   * `PluginSurface` reads open/target during mount. Host-facing, not
   * plugin-facing: plugins go through {@link isPluginOpen} /
   * {@link setPluginOpen} and friends.
   */
  ensurePluginUiState(e, t = "panel", s = "left") {
    if (!this.pluginUiState.has(e)) {
      const i = this.getPluginUiConfig(e);
      this.pluginUiState.set(e, {
        open: (i == null ? void 0 : i.open) ?? !1,
        visible: (i == null ? void 0 : i.visible) ?? !0,
        target: (i == null ? void 0 : i.target) ?? t,
        position: (i == null ? void 0 : i.position) ?? s
      });
      return;
    }
    this.applyPluginUiConfig(e);
  }
  applyPluginUiConfig(e) {
    const t = this.pluginUiState.get(e);
    if (!t) return;
    const s = this.getPluginUiConfig(e);
    this.pluginUiState.set(e, {
      open: (s == null ? void 0 : s.open) ?? t.open,
      visible: (s == null ? void 0 : s.visible) ?? t.visible,
      target: (s == null ? void 0 : s.target) ?? t.target,
      position: (s == null ? void 0 : s.position) ?? t.position
    });
  }
  /**
   * The effective render target for a plugin — the authored default unless a
   * config override (`config.plugins[id].target`) or {@link setPluginTarget}
   * changed it. Read reactively by the toolbar (flyout vs plain button) and by
   * each plugin panel's `isVisible`. Defaults to `'panel'` for an unknown id.
   */
  getPluginTarget(e) {
    var t;
    return ((t = this.pluginUiState.get(e)) == null ? void 0 : t.target) ?? "panel";
  }
  /**
   * Move a plugin between its panel and flyout chrome after mount — the
   * imperative sibling of {@link setPluginOpen}, and the same effect as setting
   * `config.plugins[id].target`. A no-op if the plugin is unknown or already on
   * `target`. Switching remounts the plugin's UI in the new container (see
   * {@link PluginUiConfig.target}).
   */
  setPluginTarget(e, t) {
    const s = this.pluginUiState.get(e);
    !s || s.target === t || (this.pluginUiState.set(e, { ...s, target: t }), this.dispatchStateChange());
  }
  /**
   * The effective panel dock position for a plugin — the authored default
   * unless a config override (`config.plugins[id].position`) or
   * {@link setPluginPosition} changed it. Read reactively by each of the
   * left/right/bottom/overlay panel render sites. Meaningful only while the
   * plugin's effective {@link getPluginTarget} is `'panel'`; a flyout ignores
   * it. Defaults to `'left'` for an unknown id.
   */
  getPluginPosition(e) {
    var t;
    return ((t = this.pluginUiState.get(e)) == null ? void 0 : t.position) ?? "left";
  }
  /**
   * Move a plugin's panel to a new dock position after mount — the
   * imperative sibling of {@link setPluginTarget}, and the same effect as
   * setting `config.plugins[id].position`. A no-op if the plugin is unknown
   * or already at `position`. Has no visible effect while the plugin's
   * effective target is `'flyout'` (see {@link PluginUiConfig.position}).
   */
  setPluginPosition(e, t) {
    const s = this.pluginUiState.get(e);
    !s || s.position === t || (this.pluginUiState.set(e, { ...s, position: t }), this.dispatchStateChange());
  }
  applyPluginUiConfigToAll() {
    for (const e of this.pluginUiState.keys())
      this.applyPluginUiConfig(e);
  }
  /**
   * Is a plugin's panel/flyout currently open? The read half of
   * {@link setPluginOpen}, and the state a plugin's `PluginSurface.isOpen`
   * projects. Reflects every open-state write source alike: the toolbar button
   * ({@link togglePluginOpen}), flyout light-dismiss
   * ({@link closePluginFlyouts}), and `config.plugins[id].open`. Returns
   * `false` for an unknown id.
   */
  isPluginOpen(e) {
    var t;
    return ((t = this.pluginUiState.get(e)) == null ? void 0 : t.open) ?? !1;
  }
  /**
   * Open or close a plugin's panel/flyout. A no-op (and no notification) if the
   * plugin is unknown or already in that state, matching
   * {@link setPluginTarget} / {@link setPluginPosition} — a redundant call must
   * not wake every plugin's subscription for a change that did not happen.
   */
  setPluginOpen(e, t) {
    const s = this.pluginUiState.get(e);
    !s || s.open === t || (this.pluginUiState.set(e, { ...s, open: t }), this.dispatchStateChange());
  }
  /**
   * Flip a plugin's open state. This is what the plugin's toolbar button does,
   * so it must notify exactly like {@link setPluginOpen} — a plugin observing
   * its own `PluginSurface.isOpen` reacts to a button press and to a
   * programmatic open identically.
   */
  togglePluginOpen(e) {
    const t = this.pluginUiState.get(e);
    t && (this.pluginUiState.set(e, { ...t, open: !t.open }), this.dispatchStateChange());
  }
  /**
   * Close every open plugin flyout. Used by the toolbar to light-dismiss
   * flyouts on outside click / Escape. No-op (and no event) if none are open.
   *
   * Flyouts declaring `dismiss: 'explicit'` (SPEC.md — Dismiss) are skipped:
   * they close only via their toolbar button, so a live-editing surface is not
   * dismissed by an outside pointer-down. Built-in toolbar dropdowns are
   * unaffected (they are core-owned and light-dismiss elsewhere).
   */
  closePluginFlyouts() {
    let e = !1;
    for (const t of this.pluginFlyouts) {
      if (this.getPluginTarget(t.pluginId) !== "flyout" || t.dismiss === "explicit") continue;
      const s = this.pluginUiState.get(t.pluginId);
      s != null && s.open && (this.pluginUiState.set(t.pluginId, { ...s, open: !1 }), e = !0);
    }
    e && this.dispatchStateChange();
  }
  // ==================== PLUGIN METHODS ====================
  /**
   * Register the toolbar chrome for an SDK plugin on the core-owned-chrome path
   * (epic restore-plugin-toolbar-chrome, ticket 02). Core renders the button
   * from the plugin's {@link IconDescriptor} and {@link PluginUiTarget}, and the
   * anchored flyout / docked panel container hosts the plugin content via the
   * DOM-mount `mount` thunk. `pluginMenuButtons` +
   * `pluginFlyouts`/`pluginPanels` are the one plugin-chrome rendering path.
   *
   * `id` is the caller-owned plugin id (used for open-state + unregister); it
   * must be passed to {@link unregisterPlugin} on deactivation.
   *
   * `name` is the plugin's package-qualified IDENTITY, kept on the records for
   * diagnostics and as the fallback. `label` — when the caller supplies
   * it — is the DISPLAY COPY: a thunk the render sites call so the label
   * re-resolves on an active-locale change. Chrome with no `label` renders
   * `name` exactly as it did before `label` existed.
   */
  registerSdkChrome(e) {
    const { id: t, name: s, label: i, icon: r, target: a, dismiss: l, mount: o } = e;
    this.ensurePluginUiState(t, a, e.position ?? "left");
    const u = `tri-flyout-${t}`, f = {
      id: `${t}:toggle`,
      pluginId: t,
      iconDescriptor: r,
      tooltip: s,
      label: i,
      flyoutDomId: u,
      onClick: () => {
        this.togglePluginOpen(t);
      },
      isActive: () => this.isPluginOpen(t),
      isVisible: () => {
        var m;
        return ((m = this.pluginUiState.get(t)) == null ? void 0 : m.visible) ?? !0;
      },
      order: 200
    }, h = {
      id: `${t}:flyout`,
      domId: u,
      pluginId: t,
      name: s,
      label: i,
      iconDescriptor: r,
      mount: o,
      dismiss: l
    }, y = {
      id: `${t}:panel`,
      pluginId: t,
      name: s,
      label: i,
      iconDescriptor: r,
      mount: o,
      isVisible: () => this.getPluginTarget(t) === "panel" && this.isPluginOpen(t)
    };
    this.pluginMenuButtons = [...this.pluginMenuButtons, f], this.pluginPanels = [...this.pluginPanels, y], this.pluginFlyouts = [...this.pluginFlyouts, h];
  }
  /**
   * Unregister a plugin's UI components by ID prefix.
   * Note: This cleans up the menu button, panel, and flyout records, but does
   * not run the plugin's own teardown — the plugin's `PluginActivation`
   * (`deactivate()`) owns that.
   */
  unregisterPlugin(e) {
    this.pluginMenuButtons = this.pluginMenuButtons.filter((t) => !t.id.startsWith(`${e}:`)), this.pluginPanels = this.pluginPanels.filter((t) => !t.id.startsWith(`${e}:`)), this.pluginFlyouts = this.pluginFlyouts.filter((t) => !t.id.startsWith(`${e}:`)), this.pluginUiState.delete(e);
  }
  /**
   * Notify that OSD viewer is ready.
   * With the component-based system, we don't notify plugins individually.
   * Instead, plugins should use the OSDViewer instance from context or listen for 'osd-ready' event (if we emitted one).
   * But since we have direct access to osdViewer in this state, components can just react to it.
   */
  notifyOSDReady(e) {
    this.osdViewer = e;
  }
  /**
   * Cleanup everything.
   */
  destroyAllPlugins() {
    this.pluginMenuButtons = [], this.pluginPanels = [], this.pluginFlyouts = [], this.pluginUiState.clear();
  }
  /**
   * Subscribe to viewer-state changes. The listener is called — with no
   * arguments — on the flush after any inventoried `command`/`observable`
   * member changes, regardless of write source. Notifications are batched
   * (many changes in one tick collapse to one call) and payload-free: read the
   * state you need, do not reconstruct transitions. Listeners fire in
   * registration order. Returns an unsubscribe function.
   *
   * SSR-safe: calling this on the server registers the listener but starts no
   * effect and delivers no notifications (state reads stay synchronously
   * current everywhere).
   *
   * `onError` (ticket 09) is called with the thrown value if this listener
   * throws during delivery; the throw never stops other listeners or core's
   * own reactions. The SDK passes one per activation so a throwing listener is
   * attributed to its owning plugin (`pluginerror` phase `subscription`).
   */
  subscribe(e, t) {
    const s = { listener: e, onError: t };
    return c(this, ae).push(s), this.startSubscriptionWatcher(), () => {
      const i = c(this, ae).indexOf(s);
      i !== -1 && c(this, ae).splice(i, 1);
    };
  }
  /**
   * Lazily start the reactivity-driven watcher (browser only, once). Kept out
   * of the constructor so server-side construction never creates an effect and
   * viewers with no subscribers pay nothing.
   */
  startSubscriptionWatcher() {
    if (!(c(this, ge) || typeof window > "u")) {
      O(this, ve, !1), O(this, ge, Vi(() => {
        Di(() => {
          this.trackWatchedMembers(), c(this, ve) ? qi(() => this.notifySubscribers()) : O(this, ve, !0);
        });
      }));
      try {
        ms();
      } catch {
      }
    }
  }
  /**
   * Read every watched member so the watcher effect depends on all of them.
   * Reading a plain member registers an identity dependency; reactive
   * collections additionally need their mutation version read (via `keys()`,
   * which also covers `.size` changes) so adds, deletes, clears, and same-size
   * content swaps all notify.
   */
  trackWatchedMembers() {
    const e = this;
    for (const t of rn.WATCHED_MEMBERS) {
      const s = e[t];
      (s instanceof Ae || s instanceof U) && s.keys();
    }
  }
  notifySubscribers() {
    for (const e of [...c(this, ae)])
      this.invokeSubscriptionListener(e);
  }
  /**
   * Single guarded call site for a subscription listener (ticket 09): a
   * throwing listener is isolated so the remaining listeners and core's own
   * reactions still run. The failure is routed to the listener's own
   * `onError` when one was registered — the SDK uses this to attribute the
   * throw to the owning plugin and raise `pluginerror` phase `subscription` —
   * and otherwise falls back to a console error. `onError` itself is guarded
   * so a faulty reporter cannot break delivery either.
   */
  invokeSubscriptionListener(e) {
    try {
      e.listener();
    } catch (t) {
      if (e.onError)
        try {
          e.onError(t);
        } catch (s) {
          console.error("[ViewerState] A subscription error reporter threw; delivery continues.", s);
        }
      else
        console.error("[ViewerState] A subscription listener threw; other listeners are unaffected.", t);
    }
  }
  /**
   * Tear down this viewer state: dispose the subscription watcher's effect
   * root, drop all listeners, and release plugin registrations. After destroy
   * no further notifications are delivered. Idempotent.
   */
  destroy() {
    var e;
    (e = c(this, ge)) == null || e.call(this), O(this, ge, null), O(this, ve, !1), O(this, ae, []), this.destroyAllPlugins();
  }
};
He = new WeakMap(), We = new WeakMap(), Qe = new WeakMap(), Ke = new WeakMap(), Ye = new WeakMap(), Xe = new WeakMap(), Ze = new WeakMap(), Je = new WeakMap(), et = new WeakMap(), tt = new WeakMap(), nt = new WeakMap(), st = new WeakMap(), it = new WeakMap(), rt = new WeakMap(), at = new WeakMap(), ot = new WeakMap(), lt = new WeakMap(), ct = new WeakMap(), ut = new WeakMap(), ft = new WeakMap(), ht = new WeakMap(), dt = new WeakMap(), gt = new WeakMap(), vt = new WeakMap(), pt = new WeakMap(), mt = new WeakMap(), yt = new WeakMap(), bt = new WeakMap(), wt = new WeakMap(), St = new WeakMap(), Ct = new WeakMap(), _t = new WeakMap(), At = new WeakMap(), It = new WeakMap(), Pt = new WeakMap(), Et = new WeakMap(), Mt = new WeakMap(), xt = new WeakMap(), Rt = new WeakMap(), Tt = new WeakMap(), kt = new WeakMap(), Ot = new WeakMap(), Dt = new WeakMap(), Lt = new WeakMap(), Vt = new WeakMap(), Ft = new WeakMap(), Ut = new WeakMap(), Gt = new WeakMap(), Bt = new WeakMap(), ae = new WeakMap(), ge = new WeakMap(), ve = new WeakMap(), // ==================== FRAMEWORK-NEUTRAL SUBSCRIPTIONS (ADR 0008) ==========
//
// `subscribe` gives plugins a reactivity-driven, batched, payload-free
// notification independent of the Web Component event target above. A single
// `$effect.root`-based watcher reads every inventoried `command` and
// `observable` member; any write source — command, core-internal Svelte
// binding, or unsupported direct assignment — re-runs it on the next flush
// and wakes subscribers. Completeness is structural (nobody has to remember
// to call `notify()`); the price is timing: notifications are batched and
// delivered on the microtask flush, never synchronously inside a mutator.
// Selectors (ticket 07) and `pluginerror` attribution (ticket 09) build on
// top of this; `invokeSubscriptionListener` is the seam ticket 09 replaces.
/**
 * Inventoried members whose changes wake subscribers, derived from the state
 * inventory so the watcher and the inventory cannot drift: `command` and
 * `observable` members notify; `internal` and `query-only` members never do.
 */
_(rn, "WATCHED_MEMBERS", sr.filter((e) => e.classification === "command" || e.classification === "observable").map((e) => e.member));
let Rn = rn;
const Er = "en";
function Mr(n, e) {
  return e ? n.replace(
    /\{(\w+)\}/g,
    (t, s) => s in e ? String(e[s]) : t
  ) : n;
}
function xr(n, e = {}) {
  function t(s) {
    var r, a;
    const i = n.current;
    return ((r = e[i]) == null ? void 0 : r[s]) ?? ((a = e[Er]) == null ? void 0 : a[s]) ?? s;
  }
  return {
    get current() {
      return n.current;
    },
    t(s, i) {
      return Mr(t(s), i);
    },
    subscribe(s) {
      return n.subscribe(s);
    }
  };
}
const Ur = "1.0.0-rc.25", Gr = "1.0.0", Br = ["osd@5"];
function Nr(n, e, t) {
  return n.ensurePluginUiState(e, t), {
    get id() {
      return e;
    },
    get isOpen() {
      return n.isPluginOpen(e);
    },
    get target() {
      return n.getPluginTarget(e);
    },
    open() {
      n.setPluginOpen(e, !0);
    },
    close() {
      n.setPluginOpen(e, !1);
    },
    toggle() {
      n.togglePluginOpen(e);
    }
  };
}
function Rr(n = {}) {
  const e = new Rn();
  if (n.config && e.updateConfig(n.config), n.activeLocale !== void 0 && (e.activeLocale = n.activeLocale), n.manifest) {
    const { id: t, json: s, canvasId: i } = n.manifest;
    e.setManifestData(t, s, i ? { canvasId: i } : void 0).catch(() => {
    });
  }
  return e;
}
function Tr(n) {
  return {
    get current() {
      return n.activeLocale;
    },
    subscribe(e) {
      let t = n.activeLocale;
      return n.subscribe(() => {
        const s = n.activeLocale;
        s !== t && (t = s, e(s));
      });
    }
  };
}
function qr(n, e) {
  return xr(Tr(n), e);
}
async function zr() {
  try {
    ms();
  } catch {
  }
  await Promise.resolve();
}
function $r(n = {}) {
  const e = Rr(n.fixtures), t = kr(e), s = ji(), i = s.claim(t), r = Hi(e);
  si(e, r);
  let a = !1;
  const l = {
    element: t,
    state: e,
    get: s.get,
    subscribe: s.subscribe,
    armUnboundWarning: s.armUnboundWarning,
    claim: s.claim,
    setOsdViewer(o) {
      e.notifyOSDReady(
        o
      );
    },
    dispose() {
      a || (a = !0, i.release(), ii(e, r), r.dispose());
    }
  };
  return i.publish(l), l;
}
function kr(n) {
  const e = globalThis.document, t = typeof (e == null ? void 0 : e.createElement) == "function" ? e.createElement(
    Vs
  ) : Or();
  return Object.defineProperty(t, "viewerState", {
    configurable: !0,
    enumerable: !0,
    get: () => n
  }), t;
}
function Or() {
  const n = Vs;
  return {
    tagName: n.toUpperCase(),
    nodeName: n.toUpperCase(),
    localName: n,
    isConnected: !1,
    getAttribute: () => null,
    addEventListener: () => {
    },
    removeEventListener: () => {
    },
    dispatchEvent: () => !1
  };
}
export {
  Ur as CORE_VERSION,
  Rn as ViewerState,
  Br as capabilities,
  Tr as createActiveLocaleSource,
  qr as createHeadlessLocaleService,
  Rr as createHeadlessViewerState,
  xr as createPluginLocaleService,
  Nr as createPluginSurface,
  $r as createTestViewerHandle,
  zr as flush,
  Gr as pluginApiVersion
};
