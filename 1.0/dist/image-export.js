function A(t) {
  return (t == null ? void 0 : t.id) || (t == null ? void 0 : t["@id"]) || null;
}
function b(t) {
  return A(t) || "";
}
const tt = {
  debug: (...t) => void 0,
  info: (...t) => void 0,
  warn: (...t) => void 0,
  error: (...t) => void 0
};
function y(t) {
  return Array.isArray(t) ? t : t == null ? [] : [t];
}
const O = /* @__PURE__ */ new WeakSet();
function et(t) {
  !t || typeof t != "object" || O.has(t) || (O.add(t), t.id ?? t["@id"], ["images", "items", "content"].filter(
    (e) => t[e] !== void 0
  ));
}
function q(t) {
  if (!t) return [];
  const e = y(t.images).filter((i) => !!i);
  if (e.length > 0) return e;
  const n = y(t.items ?? t.content).flatMap(
    (i) => y(i == null ? void 0 : i.items).filter((o) => !!o)
  );
  return n.length === 0 && et(t), n;
}
function M(t) {
  return (t == null ? void 0 : t.body) || (t == null ? void 0 : t.resource) || null;
}
function L(t) {
  if (!t || Array.isArray(t)) return !1;
  const e = t.type || t["@type"];
  return e === "Choice" || e === "oa:Choice";
}
function P(t) {
  return t ? [
    ...y(t.default),
    ...y(t.items || t.item)
  ].filter((e) => !!e) : [];
}
function nt(t) {
  const e = (t == null ? void 0 : t.behavior) || [];
  return e ? (Array.isArray(e) ? e : [e]).map((n) => {
    const i = String(n).trim().toLowerCase(), o = i.split(/[#/:]/);
    return o[o.length - 1] || i;
  }) : [];
}
function E(t) {
  const e = nt(t);
  return e.includes("non-paged") || e.includes("facing-pages");
}
function rt(t, e) {
  const r = [];
  for (let n = 0; n < Math.min(e, t.length); n++) {
    const i = t[n], o = b(i);
    r.push({
      startIndex: n,
      endIndex: n,
      entries: o ? [{ canvasId: o, canvas: i }] : []
    });
  }
  for (let n = e; n < t.length; ) {
    const i = t[n], o = b(i), s = t[n + 1], c = b(s), u = !!s && !!o && !!c && !E(i) && !E(s);
    r.push({
      startIndex: n,
      endIndex: u ? n + 1 : n,
      entries: [
        ...o ? [{ canvasId: o, canvas: i }] : [],
        ...u ? [{ canvasId: c, canvas: s }] : []
      ]
    }), n += u ? 2 : 1;
  }
  return r;
}
function te({
  canvases: t,
  currentCanvasId: e,
  currentCanvasIndex: r,
  viewingMode: n,
  pagedOffset: i
}) {
  if (!e) return [];
  if (r < 0 || r >= t.length)
    return [];
  const o = [], s = t[r];
  if (!s) return o;
  if (n !== "paged")
    return o.push({
      canvasId: e,
      canvas: s
    }), o;
  const c = rt(t, i).find(
    ({ startIndex: u, endIndex: l }) => r >= u && r <= l
  );
  return (c == null ? void 0 : c.entries) ?? o;
}
function B(t, e) {
  if (!t) return "";
  if (typeof t == "string") return t;
  if (typeof t == "object" && !Array.isArray(t)) {
    const r = t;
    if ("@value" in r) {
      const o = r["@value"];
      return Array.isArray(o) && o.length > 0 ? String(o[0]) : o === void 0 ? "" : String(o);
    }
    const n = Object.keys(r), i = (o) => {
      const s = r[o];
      if (s !== void 0)
        return Array.isArray(s) && s.length > 0 ? String(s[0]) : String(s);
    };
    if (e) {
      const o = i(e);
      if (o !== void 0) return o;
    }
    for (const o of ["en", "none"]) {
      const s = i(o);
      if (s !== void 0) return s;
    }
    return n.length > 0 ? i(n[0]) ?? "" : "";
  }
  if (Array.isArray(t) && t.length > 0) {
    if (typeof t[0] == "string") return t[0];
    const r = t, n = (c) => (c == null ? void 0 : c.value) ?? (c == null ? void 0 : c._value) ?? (c == null ? void 0 : c["@value"]), i = (c) => r.find(
      (u) => u.locale === c || u._locale === c || u.language === c || u["@language"] === c
    );
    if (e) {
      const c = i(e), u = n(c);
      if (u) return u;
    }
    const o = i("en");
    {
      const c = n(o);
      if (c) return c;
    }
    const s = r.find(
      (c) => !c.locale && !c._locale && !c.language && !c["@language"]
    );
    {
      const c = n(s);
      if (c) return c;
    }
    return n(r[0]) ?? "";
  }
  return String(t);
}
function ee(t, e, r) {
  const n = e === void 0 ? "Untitled canvas" : `Canvas ${e + 1}`, i = t == null ? void 0 : t.label;
  if (i) {
    const o = B(i, r);
    if (o)
      return o;
  }
  return n;
}
function N(t) {
  if (!t) return null;
  const e = t.match(
    /xywh=(?:pixel:)?([\d.]+),([\d.]+),([\d.]+),([\d.]+)/
  );
  return e ? [
    Number(e[1]),
    Number(e[2]),
    Number(e[3]),
    Number(e[4])
  ] : null;
}
function V(t) {
  const [e] = t.split("#");
  return e || null;
}
function x(t) {
  if (!t) return null;
  if (typeof t == "string")
    return t;
  if (Array.isArray(t)) {
    for (const r of t) {
      const n = x(r);
      if (n)
        return n;
    }
    return null;
  }
  if (typeof t != "object")
    return null;
  const e = t;
  return typeof e.id == "string" ? e.id : typeof e["@id"] == "string" ? e["@id"] : e.source ? x(e.source) : null;
}
function $(t) {
  if (!t) return [];
  if (Array.isArray(t))
    return t.flatMap((r) => $(r));
  if (typeof t != "object")
    return [];
  const e = t;
  return e.item ? $(e.item) : [e];
}
function it(t) {
  const e = t.find(
    (n) => (n == null ? void 0 : n.type) === "FragmentSelector" && typeof (n == null ? void 0 : n.value) == "string" && n.value.includes("xywh=")
  );
  if (e)
    return N(e.value);
  const r = t.find(
    (n) => typeof (n == null ? void 0 : n.value) == "string" && n.value.includes("xywh=")
  );
  return r ? N(r.value) : null;
}
function R(t) {
  if (!t) return [];
  if (Array.isArray(t))
    return t.flatMap((i) => R(i));
  const e = x(t), r = typeof t == "object" && t && "selector" in t ? $(t.selector) : [], n = it(r) || (e ? N(e) : null);
  return [
    {
      raw: t,
      targetId: e,
      canvasId: e ? V(e) : null,
      selectors: r,
      xywh: n
    }
  ];
}
function D(t) {
  return t.endsWith("/info.json") ? t.slice(0, -10) : t;
}
function H(t) {
  return typeof t == "number" && Number.isFinite(t) && t > 0 ? t : null;
}
function st(t) {
  return {
    width: H(t == null ? void 0 : t.width),
    height: H(t == null ? void 0 : t.height)
  };
}
function ot(t) {
  return (t == null ? void 0 : t.type) === "SpecificResource" && (t != null && t.source) ? t.source : null;
}
function ct(t) {
  const e = (t == null ? void 0 : t.width) || null, r = (t == null ? void 0 : t.height) || null;
  return typeof e != "number" || typeof r != "number" ? null : { width: e, height: r };
}
function ut(t) {
  var r;
  const e = (r = R(t == null ? void 0 : t.target).find(
    (n) => n.xywh
  )) == null ? void 0 : r.xywh;
  return e ? {
    x: e[0],
    y: e[1],
    width: e[2],
    height: e[3]
  } : null;
}
function lt(t, e) {
  if (typeof t != "string" || !t.trim())
    return null;
  const r = t.trim(), n = r.startsWith("pct:"), o = (n ? r.slice(4) : r).split(",").map((s) => Number(s.trim()));
  return o.length !== 4 || o.some((s) => !Number.isFinite(s) || s < 0) ? null : n ? typeof e.width != "number" || typeof e.height != "number" ? null : {
    x: o[0] / 100 * e.width,
    y: o[1] / 100 * e.height,
    width: o[2] / 100 * e.width,
    height: o[3] / 100 * e.height
  } : {
    x: o[0],
    y: o[1],
    width: o[2],
    height: o[3]
  };
}
function ft(t, e) {
  var r;
  return lt(
    ((r = t == null ? void 0 : t.selector) == null ? void 0 : r.type) === "ImageApiSelector" ? t.selector.region : null,
    e
  );
}
function at(t) {
  return [t.x, t.y, t.width, t.height].map((e) => Math.round(e)).join(",");
}
function ht(t, e, r) {
  let n = null, i = M(t);
  if (i) {
    if (L(i)) {
      const o = P(i), s = r == null ? void 0 : r(e);
      i = (s ? o.find((u) => A(u) === s) : null) || o[0] || null;
    }
    n = Array.isArray(i) ? i[0] : i;
  }
  return n;
}
function k(t) {
  return typeof t == "string" ? /^https?:\/\/iiif\.io\/api\/image\//.test(t) || t === "level0" || t === "level1" || t === "level2" : Array.isArray(t) ? t.some((e) => k(e)) : !1;
}
function gt(t) {
  return typeof t == "string" ? t || null : Array.isArray(t) && t.find(
    (r) => typeof r == "string"
  ) || null;
}
function dt(t) {
  let e = [];
  return t != null && t.service && (e = Array.isArray(t.service) ? t.service : [t.service]), e.length && e.find((r) => {
    const n = r.type || r["@type"] || "", i = r.profile || "";
    return n === "ImageService1" || n === "ImageService2" || n === "ImageService3" || k(i);
  }) || null;
}
function yt(t, e) {
  for (const r of [t, e]) {
    if (!r) continue;
    const n = r.label;
    if (n) {
      const i = B(n);
      if (i) return i;
    }
  }
  return null;
}
function mt(t) {
  const e = dt(t), r = A(e), n = e ? e.profile || "" : null;
  return {
    serviceId: r ? D(r) : null,
    serviceProfile: gt(n)
  };
}
function pt(t) {
  if (!t || !t.includes("/iiif/"))
    return null;
  const e = t.split("/"), r = e.findIndex(
    (n) => n === "full" || /^\d+,\d+,\d+,\d+$/.test(n)
  );
  return r > 0 ? e.slice(0, r).join("/") : null;
}
function ne(t, e = {}) {
  return vt(t, e)[0] || null;
}
function vt(t, e = {}) {
  const r = b(t);
  if (!r)
    return [];
  const n = ct(t);
  if (!n)
    return [];
  const i = q(t);
  return i.length ? i.map((o) => {
    const s = ht(
      o,
      r,
      e.getSelectedChoice
    ), c = ot(s) || s;
    if (!c)
      return null;
    const u = A(c), l = st(c), a = mt(c), f = a.serviceId || pt(u), h = ut(o), g = ft(
      s,
      l
    );
    return {
      canvasId: r,
      annotation: o,
      resource: c,
      resourceId: u,
      label: yt(c, o),
      canvasWidth: n.width,
      canvasHeight: n.height,
      resourceWidth: (g == null ? void 0 : g.width) || l.width,
      resourceHeight: (g == null ? void 0 : g.height) || l.height,
      serviceId: f,
      serviceProfile: a.serviceProfile,
      imageApiRegion: g,
      x: h ? h.x / n.width : 0,
      // OSD viewport coordinates normalize BOTH axes to the reference
      // image's width (aspect ratio preserved: 1 vertical unit = 1
      // horizontal unit = the base image width in px). So the y offset
      // is divided by width, exactly like x and width — not by height.
      y: h ? h.y / n.width : 0,
      width: h ? h.width / n.width : 1
    };
  }).filter((o) => o !== null) : [];
}
function bt(t, e = {
  width: 1600
}) {
  const r = D(t), n = e.region || "full", i = e.quality || "default", o = e.format || "jpg", s = typeof e.width == "number" ? Math.max(1, Math.round(e.width)) : null, c = typeof e.height == "number" ? Math.max(1, Math.round(e.height)) : null, u = e.size || (s ? `${s},` : `,${c || 1600}`);
  return `${r}/${n}/${u}/0/${i}.${o}`;
}
function wt(t) {
  return typeof t == "string" ? t : Array.isArray(t) && typeof t[0] == "string" ? t[0] : null;
}
function I(t) {
  const e = wt(t);
  return e ? e === "level0" || e.endsWith("/level0.json") || e.endsWith("#level0") : !1;
}
function xt(t, e, r, n) {
  var i;
  if (!((i = t == null ? void 0 : t.IIIFTileSource) != null && i.prototype)) return e;
  try {
    const o = t.IIIFTileSource.prototype.configure.call(
      {},
      e,
      r,
      null
    ), s = new t.IIIFTileSource(o);
    return At(s, n), s;
  } catch {
    return e;
  }
}
function At(t, e) {
  if (!I(t == null ? void 0 : t.profile) || typeof (t == null ? void 0 : t.getTileUrl) != "function" || t.__triiiceratopsLevel0LowZoomPrepared) return;
  const r = t.getTileUrl.bind(t), n = typeof t.getNumTiles == "function" ? t.getNumTiles.bind(t) : null, i = Lt(), o = Mt(t), s = It(
    t,
    o,
    n
  );
  n && (t.getNumTiles = function(c) {
    return U(
      c,
      s,
      o,
      this
    ) ? { x: 0, y: 0 } : _(
      this,
      c,
      i,
      o,
      n,
      s
    ) ? { x: 1, y: 1 } : n(c);
  }), typeof (t == null ? void 0 : t.minLevel) == "number" && s >= 0 && (t.minLevel = Math.max(t.minLevel, s)), t.getTileUrl = function(c, u, l) {
    if (U(
      c,
      s,
      o,
      this
    )) {
      const a = s >= 0 ? s : c;
      return r(a, u, l);
    }
    return _(
      this,
      c,
      i,
      o,
      n,
      s
    ) ? G(this, c) : r(c, u, l);
  }, t.__triiiceratopsLevel0LowZoomPrepared = !0;
}
function _(t, e, r, n, i, o) {
  if (o >= 0) return !1;
  if (r >= 0 && e <= r || !S(t, e, n))
    return !0;
  if (!i) return !1;
  const s = i(e);
  return (s == null ? void 0 : s.x) === 1 && (s == null ? void 0 : s.y) === 1;
}
function It(t, e, r) {
  if (!r || typeof (t == null ? void 0 : t.minLevel) != "number" || typeof (t == null ? void 0 : t.maxLevel) != "number" || e.size === 0) return -1;
  for (let n = t.minLevel; n <= t.maxLevel; n++) {
    if (!S(t, n, e))
      continue;
    const i = r(n);
    if ((i == null ? void 0 : i.x) > 1 || (i == null ? void 0 : i.y) > 1)
      return n;
  }
  return -1;
}
function U(t, e, r, n) {
  return e < 0 ? !1 : t < e ? !0 : !S(n, t, r);
}
function Mt(t) {
  const e = /* @__PURE__ */ new Set(), r = t == null ? void 0 : t.scale_factors;
  if (Array.isArray(r))
    for (const n of r)
      typeof n == "number" && n > 0 && e.add(n);
  return e;
}
function S(t, e, r) {
  if (r.size === 0 || typeof (t == null ? void 0 : t.maxLevel) != "number" || typeof e != "number")
    return !0;
  const n = Math.pow(2, t.maxLevel - e);
  return r.has(n);
}
function Lt(t, e) {
  return -1;
}
function G(t, e) {
  const r = t.getLevelScale(e), n = Math.ceil(t.width * r), i = Math.ceil(t.height * r), o = t.version === 3, s = I(t == null ? void 0 : t.profile), c = o ? n === t.width && i === t.height ? "max" : s ? `${n},` : `${n},${i}` : n === t.width ? "full" : `${n},`, u = o ? "default" : "native";
  return `${t._id}/full/${c}/0/${u}.${t.tileFormat}`;
}
const p = 8e3, W = 4e7;
function re(t, e, r, n) {
  const i = Math.max(1, Math.round(t.width * e * n)), o = t.resourceWidth && t.resourceHeight ? t.resourceHeight / t.resourceWidth : r / e;
  return {
    x: Math.round(t.x * e * n),
    y: Math.round(t.y * r * n),
    width: i,
    height: Math.max(1, Math.round(i * o))
  };
}
function ie(t, e) {
  const r = URL.createObjectURL(t), n = document.createElement("a");
  n.href = r, n.download = e, document.body.appendChild(n), n.click(), n.remove(), URL.revokeObjectURL(r);
}
async function se(t, e) {
  const r = await fetch(t, e);
  if (!r.ok)
    throw new Error(`Image request failed with ${r.status}.`);
  return r.blob();
}
async function Pt(t) {
  const e = URL.createObjectURL(t);
  try {
    return await new Promise((r, n) => {
      const i = new Image();
      i.onload = () => r(i), i.onerror = () => n(new Error("Unable to decode image for export.")), i.src = e;
    });
  } finally {
    URL.revokeObjectURL(e);
  }
}
async function oe(t, e, r, n = "image/png") {
  const i = document.createElement("canvas");
  i.width = Math.max(1, Math.round(e)), i.height = Math.max(1, Math.round(r));
  const o = i.getContext("2d");
  if (!o)
    throw new Error("Unable to create a canvas for image export.");
  for (const s of t) {
    const c = await Pt(s.blob);
    o.drawImage(c, s.x, s.y, s.width, s.height);
  }
  return new Promise((s, c) => {
    i.toBlob((u) => {
      if (u) {
        s(u);
        return;
      }
      c(new Error("Unable to export composed image."));
    }, n);
  });
}
function ce(t, e) {
  let r = 1;
  t > p && (r = Math.min(r, p / t)), e > p && (r = Math.min(r, p / e));
  const n = t * e;
  return n * r * r > W && (r = Math.min(r, Math.sqrt(W / n))), r >= 1 ? {
    width: Math.round(t),
    height: Math.round(e),
    clamped: !1
  } : {
    width: Math.max(1, Math.round(t * r)),
    height: Math.max(1, Math.round(e * r)),
    clamped: !0
  };
}
function z(t, e = {}) {
  if (I(t.serviceProfile))
    return t.resourceId ?? null;
  if (t.serviceId) {
    const r = t.imageApiRegion ? at(t.imageApiRegion) : void 0, n = !!(e.width || e.height);
    return bt(t.serviceId, {
      region: r,
      size: n ? void 0 : "max",
      width: e.width,
      height: e.height
    });
  }
  return t.resourceId ?? null;
}
async function Nt(t) {
  if (!t.serviceId) return [];
  const e = t.serviceId.endsWith("/info.json") ? t.serviceId : `${t.serviceId}/info.json`;
  try {
    const r = await fetch(e);
    if (!r.ok) return [];
    const n = await r.json(), i = await import("./openseadragon-Dr2AElbV.js").then((l) => l.o), o = i.default || i, s = xt(o, n, e);
    if (!s || typeof s.minLevel != "number" || typeof s.maxLevel != "number" || typeof s.getLevelScale != "function")
      return [];
    const c = /* @__PURE__ */ new Set(), u = [];
    for (let l = s.minLevel; l <= s.maxLevel; l += 1) {
      const a = s.getLevelScale(l), f = Math.ceil(s.width * a), h = Math.ceil(s.height * a), g = `${f}x${h}`;
      c.has(g) || (c.add(g), u.push({
        width: f,
        height: h,
        label: `${f} × ${h}px`,
        url: G(s, l)
      }));
    }
    return u.sort((l, a) => a.width - l.width);
  } catch {
    return [];
  }
}
const $t = [
  { fraction: 1, label: "Original" },
  { fraction: 0.5, label: "50%" },
  { fraction: 0.25, label: "25%" }
];
function Ct(t, e, r) {
  return $t.map(({ fraction: n, label: i }) => {
    const o = Math.max(1, Math.round(t * n)), s = Math.max(1, Math.round(e * n)), c = r == null ? void 0 : r({ width: o, height: s, isOriginal: n === 1 });
    return {
      width: o,
      height: s,
      label: `${i} (${o} × ${s}px)`,
      url: c ?? void 0
    };
  }).filter((n) => !r || !!n.url);
}
function Ft(t) {
  const e = t.resourceWidth, r = t.resourceHeight;
  if (!t.serviceId || !e || !r) {
    const n = z(t);
    return n ? [
      {
        width: e ?? 0,
        height: r ?? 0,
        label: "Original",
        url: n
      }
    ] : [];
  }
  return Ct(
    e,
    r,
    ({ width: n, height: i, isOriginal: o }) => z(
      t,
      o ? {} : { width: n, height: i }
    )
  );
}
async function ue(t) {
  if (I(t.serviceProfile)) {
    const e = await Nt(t);
    return e.length ? e : t.resourceId ? [
      {
        width: t.resourceWidth ?? 0,
        height: t.resourceHeight ?? 0,
        label: "Original",
        url: t.resourceId
      }
    ] : [];
  }
  return Ft(t);
}
function v(t) {
  return typeof t == "number" && Number.isFinite(t) && t > 0;
}
function T(t, e) {
  return !t || !v(t.canvasWidth) || !v(t.canvasHeight) || !v(t.imageWidth) || !v(t.imageHeight) ? null : e === "canvas-to-image" ? {
    scaleX: t.imageWidth / t.canvasWidth,
    scaleY: t.imageHeight / t.canvasHeight
  } : {
    scaleX: t.canvasWidth / t.imageWidth,
    scaleY: t.canvasHeight / t.imageHeight
  };
}
function j(t, e, r) {
  const n = T(e, r);
  return n ? {
    x: t.x * n.scaleX,
    y: t.y * n.scaleY
  } : t;
}
function Rt(t, e, r) {
  const n = T(e, r);
  return n ? {
    x: t.x * n.scaleX,
    y: t.y * n.scaleY,
    width: t.width * n.scaleX,
    height: t.height * n.scaleY
  } : t;
}
function St(t, e, r) {
  const n = T(e, r);
  if (!n || typeof DOMParser > "u")
    return t;
  const o = new DOMParser().parseFromString(t, "image/svg+xml");
  if (o.documentElement.nodeName === "parsererror")
    return t;
  const s = (f, h) => {
    const g = Number(f);
    return Number.isFinite(g) ? String(g * (h === "x" ? n.scaleX : n.scaleY)) : f;
  }, c = (f) => f && f.replace(
    /(-?\d*\.?\d+),(-?\d*\.?\d+)/g,
    (h, g, m) => `${s(g, "x")},${s(m, "y")}`
  ), u = (f, h, g) => {
    const m = f.getAttribute(h);
    m !== null && f.setAttribute(h, s(m, g));
  };
  for (const f of Array.from(
    o.querySelectorAll("polygon, polyline")
  )) {
    const h = c(f.getAttribute("points"));
    h !== null && f.setAttribute("points", h);
  }
  for (const f of Array.from(o.querySelectorAll("rect")))
    u(f, "x", "x"), u(f, "y", "y"), u(f, "width", "x"), u(f, "height", "y"), u(f, "rx", "x"), u(f, "ry", "y");
  for (const f of Array.from(o.querySelectorAll("circle")))
    u(f, "cx", "x"), u(f, "cy", "y"), u(f, "r", "x");
  for (const f of Array.from(o.querySelectorAll("ellipse")))
    u(f, "cx", "x"), u(f, "cy", "y"), u(f, "rx", "x"), u(f, "ry", "y");
  for (const f of Array.from(o.querySelectorAll("line")))
    u(f, "x1", "x"), u(f, "y1", "y"), u(f, "x2", "x"), u(f, "y2", "y");
  const l = o.documentElement, a = l.getAttribute("viewBox");
  if (a) {
    const f = a.trim().split(/\s+/).map((h) => Number(h));
    f.length === 4 && f.every((h) => Number.isFinite(h)) && l.setAttribute(
      "viewBox",
      [
        f[0] * n.scaleX,
        f[1] * n.scaleY,
        f[2] * n.scaleX,
        f[3] * n.scaleY
      ].join(" ")
    );
  }
  return new XMLSerializer().serializeToString(o.documentElement);
}
function C(t, e, r) {
  const n = t.match(
    /xywh=(pixel:)?(-?\d*\.?\d+),(-?\d*\.?\d+),(-?\d*\.?\d+),(-?\d*\.?\d+)/
  );
  if (!n) return t;
  const i = Rt(
    {
      x: Number(n[2]),
      y: Number(n[3]),
      width: Number(n[4]),
      height: Number(n[5])
    },
    e,
    r
  );
  return t.replace(
    n[0],
    `xywh=${n[1] || ""}${i.x},${i.y},${i.width},${i.height}`
  );
}
function w(t, e, r) {
  if (!t || typeof t != "object")
    return t;
  if (Array.isArray(t))
    return t.map(
      (i) => w(i, e, r)
    );
  const n = { ...t };
  return n.item && (n.item = w(n.item, e, r)), n.selector && (n.selector = w(n.selector, e, r)), n.type === "PointSelector" ? {
    ...n,
    ...j(
      { x: Number(n.x), y: Number(n.y) },
      e,
      r
    )
  } : (typeof n.value == "string" && n.value.includes("xywh=") && (n.value = C(n.value, e, r)), n.type === "SvgSelector" && typeof n.value == "string" && (n.value = St(n.value, e, r)), n);
}
function d(t, e, r) {
  if (!t) return t;
  if (Array.isArray(t))
    return t.map((i) => d(i, e, r));
  if (typeof t == "string")
    return t.includes("xywh=") ? C(t, e, r) : t;
  if (typeof t != "object")
    return t;
  const n = { ...t };
  return n.source && (n.source = d(n.source, e, r)), n.selector && (n.selector = w(n.selector, e, r)), n.id && typeof n.id == "string" && n.id.includes("xywh=") && (n.id = C(n.id, e, r)), n;
}
function le(t, e) {
  return j(t, e, "canvas-to-image");
}
function fe(t, e) {
  return j(t, e, "image-to-canvas");
}
function ae(t, e) {
  return {
    ...t,
    ...t.target ? {
      target: d(
        t.target,
        e,
        "canvas-to-image"
      )
    } : {},
    ...t.on ? { on: d(t.on, e, "canvas-to-image") } : {}
  };
}
function he(t, e) {
  return {
    ...t,
    ...t.target ? {
      target: d(
        t.target,
        e,
        "image-to-canvas"
      )
    } : {},
    ...t.on ? { on: d(t.on, e, "image-to-canvas") } : {}
  };
}
const Tt = 5;
function ge(t) {
  const e = t == null ? void 0 : t.radius;
  return typeof e == "number" && Number.isFinite(e) && e > 0 ? e : Tt;
}
const de = 0.0125;
function jt(t) {
  return !!t && typeof t == "object" && "tileSource" in t;
}
function X(t, e) {
  if (!t || typeof t != "object") return null;
  const r = t[e];
  return typeof r == "number" && Number.isFinite(r) && r > 0 ? r : null;
}
function Ot(t, e, r) {
  return Math.min(r, Math.max(e, t));
}
function Et(t) {
  const e = [...t].sort((n, i) => n - i), r = Math.floor(e.length / 2);
  return e.length % 2 === 0 ? (e[r - 1] + e[r]) / 2 : e[r];
}
function Ht(t) {
  const e = /* @__PURE__ */ new Map();
  return t.forEach((r, n) => {
    const i = jt(r), o = i ? r.tileSource : r, s = i ? r.canvasId ?? `canvas-${n}` : `canvas-${n}`, c = i ? r.x ?? 0 : 0, u = i ? r.y ?? 0 : 0, l = i ? r.width ?? 1 : 1, a = X(o, "width"), f = X(o, "height"), h = a && f ? l * f / a : null;
    let g = e.get(s);
    g || (g = { canvasId: s, sources: [], width: 0, height: null }, e.set(s, g)), g.sources.push({
      source: r,
      tileSource: o,
      localX: c,
      localY: u,
      localWidth: l,
      localHeight: h
    }), g.width = Math.max(g.width, c + l), g.height = h === null ? null : Math.max(g.height ?? 0, u + h);
  }), [...e.values()];
}
function _t(t) {
  return {
    layouts: t.map((e) => ({
      canvasId: e.canvasId,
      x: 0,
      y: 0,
      width: e.width,
      height: e.height ?? 1
    })),
    sources: t.flatMap(
      (e) => e.sources.map(({ tileSource: r, localX: n, localY: i, localWidth: o }) => ({
        tileSource: r,
        x: n,
        y: i,
        width: o,
        canvasId: e.canvasId
      }))
    )
  };
}
function ye(t, e) {
  const r = Ht(t);
  if (e.mode === "individuals" || r.length <= 1)
    return _t(r);
  const n = !e.preserveCanvasScale && r.every((s) => s.height !== null), i = n ? Et(r.map((s) => s.height)) : 1, o = r.map((s) => {
    const c = n ? Ot(i / s.height, 0.25, 4) : 1;
    return {
      group: s,
      scale: c,
      width: s.width * c,
      height: (s.height ?? 1) * c,
      x: 0,
      y: 0
    };
  });
  if (e.mode === "continuous") {
    let s = 0;
    const c = e.direction === "top-to-bottom" || e.direction === "bottom-to-top", u = e.direction === "right-to-left" || e.direction === "bottom-to-top";
    for (const l of o)
      c ? (l.y = u ? -s : s, s += (n ? l.height : 1) + e.gap) : (l.x = u ? -s : s, s += (n ? l.width : 1) + e.gap);
  } else if (e.mode === "paged") {
    const s = Math.max(...o.map((u) => u.height)), c = e.direction === "right-to-left";
    o.forEach((u, l) => {
      const a = c ? o.slice(l + 1) : o.slice(0, l);
      u.x = a.reduce(
        (f, h) => f + (n ? h.width : 1) + e.gap,
        0
      ), u.y = (s - u.height) / 2;
    });
  }
  return {
    layouts: o.map((s) => ({
      canvasId: s.group.canvasId,
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height
    })),
    sources: o.flatMap(
      (s) => s.group.sources.map(
        ({ tileSource: c, localX: u, localY: l, localWidth: a }) => ({
          tileSource: c,
          x: s.x + u * s.scale,
          y: s.y + l * s.scale,
          width: a * s.scale,
          canvasId: s.group.canvasId
        })
      )
    )
  };
}
function Ut(t) {
  return t.id || t["@id"] || "";
}
function Wt(t) {
  const e = Z(t), r = [];
  for (const i of R(e)) {
    for (const o of i.selectors) {
      const s = Bt(o);
      if (s) {
        const u = Vt(s);
        u && r.push(u);
      }
      const c = zt(o);
      c && r.push(c);
    }
    i.xywh && r.push({
      type: "RECTANGLE",
      x: i.xywh[0],
      y: i.xywh[1],
      w: i.xywh[2],
      h: i.xywh[3]
    });
  }
  if (r.length > 0)
    return r;
  const n = K(t);
  return n ? [n] : [];
}
function zt(t) {
  const e = (t == null ? void 0 : t.item) || t;
  if ((e == null ? void 0 : e.type) !== "PointSelector")
    return null;
  const r = Number(e.x), n = Number(e.y);
  return !Number.isFinite(r) || !Number.isFinite(n) ? null : {
    type: "POINT",
    x: r,
    y: n
  };
}
function Y(t) {
  const e = t == null ? void 0 : t.__triiiceratopsCanvas;
  return !e || typeof e != "object" ? null : e;
}
function Z(t) {
  return (t == null ? void 0 : t.target) || (t == null ? void 0 : t.on) || null;
}
function J(t) {
  const e = x(t);
  return e ? V(e) || e : null;
}
function F(t) {
  return t ? Array.isArray(t) ? t.some(F) : typeof t == "string" ? t.includes("#") : t.selector ? !0 : !!(t.source && F(t.source)) : !1;
}
function K(t) {
  const e = Y(t);
  if (!(e != null && e.id) || !e.width || !e.height)
    return null;
  const r = t.target || t.on;
  return F(r) || J(r) !== e.id ? null : {
    type: "RECTANGLE",
    x: 0,
    y: 0,
    w: e.width,
    h: e.height
  };
}
function Xt(t) {
  return K(t) !== null;
}
function qt(t, e) {
  if (e)
    return "canvas";
  const r = t == null ? void 0 : t.__triiiceratopsAnnotationOrigin;
  if (r === "user")
    return "canvas";
  if (r === "manifest")
    return "image";
  const n = Y(t), i = J(Z(t));
  return n != null && n.id && i === n.id ? "canvas" : "image";
}
function Bt(t) {
  var r;
  if (!t) return null;
  const e = t.selector || t;
  if (Array.isArray(e)) {
    const n = e.find((i) => i.type === "SvgSelector");
    return n && n.value ? n.value : null;
  }
  return (e == null ? void 0 : e.type) === "SvgSelector" && e.value ? e.value : ((r = e == null ? void 0 : e.item) == null ? void 0 : r.type) === "SvgSelector" && e.item.value ? e.item.value : null;
}
function Vt(t) {
  try {
    const r = new DOMParser().parseFromString(t, "image/svg+xml");
    if (r.documentElement.nodeName === "parsererror")
      return tt.warn("Failed to parse SVG selector:", t), null;
    const n = [], i = r.querySelectorAll("polygon");
    for (const u of i) {
      const l = u.getAttribute("points");
      if (l) {
        const a = Dt(l);
        n.push(...a);
      }
    }
    const o = r.querySelectorAll("path");
    for (const u of o) {
      const l = u.getAttribute("d");
      if (l) {
        const a = kt(l);
        n.push(...a);
      }
    }
    const s = r.querySelectorAll("circle");
    for (const u of s) {
      const l = parseFloat(u.getAttribute("cx") || "0"), a = parseFloat(u.getAttribute("cy") || "0"), f = parseFloat(u.getAttribute("r") || "0"), h = Gt(l, a, f);
      n.push(...h);
    }
    const c = r.querySelectorAll("rect");
    for (const u of c) {
      const l = parseFloat(u.getAttribute("x") || "0"), a = parseFloat(u.getAttribute("y") || "0"), f = parseFloat(u.getAttribute("width") || "0"), h = parseFloat(u.getAttribute("height") || "0");
      n.push([l, a], [l + f, a], [l + f, a + h], [l, a + h]);
    }
    return n.length === 0 ? null : {
      type: "POLYGON",
      points: n
    };
  } catch {
    return null;
  }
}
function Dt(t) {
  const e = [], r = t.trim().split(/\s+/);
  for (const n of r) {
    const [i, o] = n.split(",").map((s) => parseFloat(s));
    !isNaN(i) && !isNaN(o) && e.push([i, o]);
  }
  return e;
}
function kt(t) {
  const e = [], r = /[ML]\s*([\d.]+)[,\s]+([\d.]+)/g;
  let n;
  for (; (n = r.exec(t)) !== null; ) {
    const i = parseFloat(n[1]), o = parseFloat(n[2]);
    !isNaN(i) && !isNaN(o) && e.push([i, o]);
  }
  return e;
}
function Gt(t, e, r, n = 8) {
  const i = [];
  for (let o = 0; o < n; o++) {
    const s = o / n * Math.PI * 2, c = t + r * Math.cos(s), u = e + r * Math.sin(s);
    i.push([c, u]);
  }
  return i;
}
function Yt(t) {
  const e = [], r = (n) => {
    const i = n.chars || n.value || n["cnt:chars"] || "";
    if (i) {
      const o = n.format === "text/html" || n.type === "TextualBody";
      e.push({
        value: i,
        isHtml: o,
        purpose: n.purpose,
        format: n.format
      });
    }
  };
  if (t.resource ? (Array.isArray(t.resource) ? t.resource : [t.resource]).forEach(r) : t.body && (Array.isArray(t.body) ? t.body : [t.body]).forEach(r), e.length === 0) {
    let n = "";
    t.label && (n = Array.isArray(t.label) ? t.label.join(" ") : t.label), n && e.push({ value: n, isHtml: !1, purpose: "commenting" });
  }
  return e.length === 0 && e.push({
    value: "Annotation",
    isHtml: !1,
    purpose: "commenting"
  }), e;
}
function Zt(t, e) {
  return `${t}::${e}`;
}
function Jt(t, e, r) {
  const n = Ut(t) || `anno-${e}`, i = Wt(t), o = Xt(t), s = qt(
    t,
    o
  );
  if (!i.length)
    return [];
  const c = Yt(t);
  return i.map((u, l) => ({
    id: n,
    renderId: Zt(n, l),
    sourceAnnotationId: n,
    geometryIndex: l,
    geometry: u,
    coordinateSpace: s,
    isFullCanvasTarget: o,
    body: c,
    isSearchHit: r
  }));
}
function me(t, e, r = !1) {
  return Jt(t, e, r)[0] ?? null;
}
function Kt(t) {
  return t.endsWith("/info.json") ? t.slice(0, -10) : t;
}
function Q(t, e) {
  let r = "";
  try {
    if (r = (t == null ? void 0 : t.profile) || "", typeof r == "object" && r) {
      const s = r;
      r = s.value || s.id || s["@id"] || JSON.stringify(s);
    }
  } catch {
  }
  const n = String(r ?? "").toLowerCase(), i = n.includes("level0") || n.includes("level-0"), o = Kt((t == null ? void 0 : t.id) || (t == null ? void 0 : t["@id"]) || "");
  return !i && o ? `${o}/full/${e},/0/default.jpg` : "";
}
function Qt(t, e = 200) {
  if (!t) return "";
  const r = Array.isArray(t) ? t[0] : t;
  if (!r) return "";
  if (typeof r == "string") return r;
  const n = r != null && r.service ? Array.isArray(r.service) ? r.service : [r.service] : [];
  for (const i of n) {
    const o = Q(i, e);
    if (o) return o;
  }
  return (r == null ? void 0 : r.id) || (r == null ? void 0 : r["@id"]) || "";
}
function pe(t, e = 200) {
  let r = "";
  try {
    const n = t == null ? void 0 : t.thumbnail;
    n && (r = Qt(n, e));
  } catch {
  }
  if (r) return r;
  try {
    const n = q(t);
    if (n && n.length > 0) {
      const i = n[0];
      let o = null, s = M(i);
      if (s && (L(s) && (s = P(s)[0] || null), o = Array.isArray(s) ? s[0] : s), o) {
        const u = (() => {
          let l = [];
          return o.service && (l = Array.isArray(o.service) ? o.service : [o.service]), l;
        })();
        if (u.length > 0) {
          const l = Q(u[0], e);
          if (l)
            return l;
        }
        if (r = o.id || o["@id"] || "", !r) {
          const l = M(i);
          if (l) {
            let a = Array.isArray(l) ? l[0] : l;
            L(a) && (a = P(a)[0] || a), r = a.id || a["@id"] || "";
          }
        }
      }
    }
  } catch {
  }
  return r;
}
export {
  Tt as DEFAULT_POINT_RADIUS,
  de as MULTI_CANVAS_GAP,
  bt as buildIiifImageRequestUrl,
  Ct as buildRelativeSizeOptions,
  le as canvasPointToImagePoint,
  ce as clampCompositeSize,
  oe as composeImages,
  ie as downloadBlob,
  se as fetchImageBlob,
  ye as getCanvasDisplayLayouts,
  b as getCanvasId,
  ee as getCanvasLabel,
  re as getCompositeImagePlacement,
  q as getPaintingAnnotations,
  z as getResolvedImageExportUrl,
  pe as getThumbnailSrc,
  te as getVisibleCanvasEntries,
  fe as imagePointToCanvasPoint,
  me as parseAnnotation,
  vt as resolveAllCanvasImages,
  ne as resolveCanvasImage,
  ue as resolveExportSizeOptions,
  B as resolveLanguageValue,
  ge as resolvePointRadius,
  he as transformAnnotationToCanvasSpace,
  ae as transformAnnotationToImageSpace
};
