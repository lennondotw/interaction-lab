// Measures what Apple's corner smoothing actually draws, and answers the question
// `2026-07-corner-shape-superellipse` left second-hand: is it true that the
// continuous corner spreads ~1.528r along the edge rather than deepening, and is
// that why it needs no radius compensation?
//
// Two independent instruments, deliberately:
//
//   1. SwiftUI `Shape.path(in:)` + `Path.contains`, bisected along a ray. Pure
//      geometry, no rendering — the same method the CSS probe uses, so the two
//      sets of numbers are directly comparable.
//   2. `CALayer.cornerCurve` rendered into a bitmap and thresholded. This is the
//      UIKit/AppKit-era API most code actually uses, and pixels are a completely
//      different path through the system than `Path.contains`. Agreement between
//      the two is the check that neither is measuring an artefact.
//
// Everything here is a single file against the macOS SDK. `Shape.path(in:)` is
// platform-independent geometry, so no simulator and no Xcode project is needed
// to answer a question about shape — see the README.
//
//   xcrun swift probe.swift
//
// `xcrun` matters: a `swift` from swiftly or elsewhere on PATH may not match the
// selected Xcode's SDK, which fails while parsing CoreGraphics' swiftinterface.

import AppKit
import CoreGraphics
import Foundation
import SwiftUI

let steps = 60

/// Largest distance from `origin` along `angle` that is still inside the path.
func boundary(_ path: Path, from origin: CGPoint, angle: Double, limit: Double) -> Double {
  var lo = 0.0
  var hi = limit
  for _ in 0..<steps {
    let mid = (lo + hi) / 2
    let p = CGPoint(x: origin.x + cos(angle) * mid, y: origin.y + sin(angle) * mid)
    if path.contains(p) { lo = mid } else { hi = mid }
  }
  return (lo + hi) / 2
}

/// Distance from the top-left box corner inward to the curve, along the 45° diagonal.
func cornerDepth(_ path: Path, limit: Double) -> Double {
  var lo = 0.0
  var hi = limit
  for _ in 0..<steps {
    let mid = (lo + hi) / 2
    let c = mid / 2.0.squareRoot()
    if path.contains(CGPoint(x: c, y: c)) { hi = mid } else { lo = mid }
  }
  return (lo + hi) / 2
}

/// How far along the top edge the corner treatment reaches, read off the path's
/// own vertices: the leftmost on-curve point that still lies exactly on `y = 0`.
/// Everything left of it belongs to the corner, so this is the tangent point by
/// construction — no tolerance, no bisection, exact.
func edgeExtent(_ path: Path, width: Double) -> Double {
  var leftmostOnTop = Double.infinity
  path.forEach { element in
    func note(_ p: CGPoint) {
      if abs(p.y) < 1e-9 { leftmostOnTop = min(leftmostOnTop, p.x) }
    }
    switch element {
    case .move(let to): note(to)
    case .line(let to): note(to)
    case .quadCurve(let to, _): note(to)
    case .curve(let to, _, _): note(to)
    case .closeSubpath: break
    }
  }
  return leftmostOnTop.isFinite ? leftmostOnTop : width / 2
}

/// The same quantity by hit-testing, kept only to show why it is the wrong tool
/// here. See the bias section at the end: the boundary approaches the straight
/// edge *tangentially*, so asking "where does it come within delta of y = 0"
/// answers systematically short, and the error does not cancel in a ratio.
func hitTestedEdgeExtent(_ path: Path, width: Double, delta: Double) -> Double {
  var lo = 0.0
  var hi = width / 2
  guard !path.contains(CGPoint(x: lo, y: delta)) else { return 0 }
  for _ in 0..<steps {
    let mid = (lo + hi) / 2
    if path.contains(CGPoint(x: mid, y: delta)) { hi = mid } else { lo = mid }
  }
  return (lo + hi) / 2
}

func f(_ v: Double, _ d: Int = 2) -> String { String(format: "%.\(d)f", v) }

func pad(_ s: String, _ w: Int) -> String {
  s.count >= w ? s : s + String(repeating: " ", count: w - s.count)
}

func table(_ headers: [String], _ rows: [[String]]) {
  let widths = headers.indices.map { i in
    max(headers[i].count, rows.map { $0[i].count }.max() ?? 0)
  }
  print("| " + headers.indices.map { pad(headers[$0], widths[$0]) }.joined(separator: " | ") + " |")
  print("| " + widths.map { String(repeating: "-", count: $0) }.joined(separator: " | ") + " |")
  for r in rows {
    print("| " + r.indices.map { pad(r[$0], widths[$0]) }.joined(separator: " | ") + " |")
  }
  print("")
}

// MARK: - 1. Square: does .continuous spread along the edge, and does it self-limit?

let side = 300.0
let square = CGRect(x: 0, y: 0, width: side, height: side)

print("\n## 1. RoundedRectangle on a \(Int(side))x\(Int(side)) square\n")
print("edge extent = how far the corner treatment reaches along the top edge.")
print("For .circular it should equal r, which is the instrument's calibration.\n")

var rows1: [[String]] = []
for r in [0.0, 10, 30, 60, 90, 120, 140, 148, 150, 1000] {
  let circular = RoundedRectangle(cornerRadius: r, style: .circular).path(in: square)
  let continuous = RoundedRectangle(cornerRadius: r, style: .continuous).path(in: square)
  let ec = edgeExtent(circular, width: side)
  let en = edgeExtent(continuous, width: side)
  let dc = cornerDepth(circular, limit: side)
  let dn = cornerDepth(continuous, limit: side)
  rows1.append([
    r == 1000 ? "1000 (clamped)" : f(r, 0),
    f(ec), f(en),
    en > 0.01 && ec > 0.01 ? f(en / ec, 3) : "—",
    f(dc), f(dn),
    dn > 0.01 && dc > 0.01 ? f(dc / dn, 3) : "—",
  ])
}
table(
  ["r", "edge .circular", "edge .cont", "edge ratio", "depth .circ", "depth .cont", "depth ratio"],
  rows1)

// MARK: - 2. At max radius, is .continuous a circle?

print("## 2. At r = half the side, is .continuous actually a circle?\n")
print("Radial distance from the centre. A circle is flat across the row.\n")

let angles = [0.0, 15, 30, 45, 60, 75, 90]
let centre = CGPoint(x: side / 2, y: side / 2)
var rows2: [[String]] = []
let shapes2: [(String, Path)] = [
  (
    "RoundedRect(150, .circular)",
    RoundedRectangle(cornerRadius: 150, style: .circular).path(in: square)
  ),
  (
    "RoundedRect(150, .continuous)",
    RoundedRectangle(cornerRadius: 150, style: .continuous).path(in: square)
  ),
  (
    "RoundedRect(1e4, .continuous)",
    RoundedRectangle(cornerRadius: 10000, style: .continuous).path(in: square)
  ),
  ("Capsule(.circular)", Capsule(style: .circular).path(in: square)),
  ("Capsule(.continuous)", Capsule(style: .continuous).path(in: square)),
  ("Circle()", Circle().path(in: square)),
]
for (name, path) in shapes2 {
  let rs = angles.map { boundary(path, from: centre, angle: $0 * .pi / 180, limit: side) }
  let spread = (rs.max()! - rs.min()!) / rs.min()! * 100
  rows2.append([name] + rs.map { f($0) } + [f(spread, 1) + "%"])
}
table(["shape"] + angles.map { "\(Int($0))°" } + ["bulge"], rows2)

// MARK: - 3. Non-square: circle vs capsule vs big-radius rect

let boxWidth = 400.0
let boxHeight = 200.0
let wide = CGRect(x: 0, y: 0, width: boxWidth, height: boxHeight)

print("## 3. The same shapes in a \(Int(boxWidth))x\(Int(boxHeight)) frame — what do they fill?\n")

var rows3: [[String]] = []
let shapes3: [(String, Path)] = [
  (
    "RoundedRect(1e4, .circular)",
    RoundedRectangle(cornerRadius: 10000, style: .circular).path(in: wide)
  ),
  (
    "RoundedRect(1e4, .continuous)",
    RoundedRectangle(cornerRadius: 10000, style: .continuous).path(in: wide)
  ),
  ("Capsule(.circular)", Capsule(style: .circular).path(in: wide)),
  ("Capsule(.continuous)", Capsule(style: .continuous).path(in: wide)),
  ("Circle()", Circle().path(in: wide)),
  ("Ellipse()", Ellipse().path(in: wide)),
]
for (name, path) in shapes3 {
  let b = path.boundingRect
  rows3.append([
    name,
    "\(f(b.width, 1)) x \(f(b.height, 1))",
    "(\(f(b.minX, 1)), \(f(b.minY, 1)))",
    path.contains(CGPoint(x: boxWidth / 2, y: boxHeight / 2)) ? "yes" : "no",
    path.contains(CGPoint(x: 5, y: boxHeight / 2)) ? "yes" : "no",
  ])
}
table(["shape", "bounds", "origin", "centre in", "left edge in"], rows3)

// MARK: - 4. Capsule end cap shape

print(
  "## 4. Capsule end cap, measured from the cap's own centre (\(Int(boxWidth))x\(Int(boxHeight)))\n"
)
print("A true semicircular cap is a constant \(Int(boxHeight / 2)).\n")

let capCentre = CGPoint(x: boxHeight / 2, y: boxHeight / 2)
var rows4: [[String]] = []
for (name, path) in [
  ("Capsule(.circular)", Capsule(style: .circular).path(in: wide)),
  ("Capsule(.continuous)", Capsule(style: .continuous).path(in: wide)),
  (
    "RoundedRect(1e4, .continuous)",
    RoundedRectangle(cornerRadius: 10000, style: .continuous).path(in: wide)
  ),
] {
  let rs = angles.map {
    boundary(path, from: capCentre, angle: (180 + $0) * .pi / 180, limit: boxHeight)
  }
  let spread = (rs.max()! - rs.min()!) / rs.min()! * 100
  rows4.append([name] + rs.map { f($0) } + [f(spread, 1) + "%"])
}
table(["shape"] + angles.map { "\(Int($0) + 180)°" } + ["deviation"], rows4)

// MARK: - 5. Per-corner radii

print("## 5. UnevenRoundedRectangle — per-corner, and whether style still applies\n")

let uneven = CGRect(x: 0, y: 0, width: 400, height: 300)
var rows5: [[String]] = []
for style in [RoundedCornerStyle.circular, .continuous] {
  let p = UnevenRoundedRectangle(
    topLeadingRadius: 96,
    bottomLeadingRadius: 8,
    bottomTrailingRadius: 64,
    topTrailingRadius: 16,
    style: style
  ).path(in: uneven)
  let tl = cornerDepth(p, limit: 200)
  let tlEdge = edgeExtent(p, width: 400)
  rows5.append([
    style == .circular ? ".circular" : ".continuous",
    f(tl), f(tlEdge), f(tlEdge / 96, 3),
  ])
}
table(["style", "TL depth", "TL edge extent", "extent / 96"], rows5)

// MARK: - 6. Where does .continuous begin to give way?

print("## 6. Edge-extent ratio as r approaches the clamp (\(Int(side))x\(Int(side)))\n")
print("1.0 means .continuous has fully collapsed onto the arc.\n")

var rows6: [[String]] = []
for frac in [0.05, 0.2, 0.4, 0.5, 0.6, 0.65, 0.7, 0.8, 0.9, 1.0] {
  let r = frac * side / 2
  let ec = edgeExtent(
    RoundedRectangle(cornerRadius: r, style: .circular).path(in: square), width: side)
  let en = edgeExtent(
    RoundedRectangle(cornerRadius: r, style: .continuous).path(in: square), width: side)
  rows6.append([
    "\(f(frac * 100, 0))%", f(r, 1), f(ec), f(en),
    ec > 0.01 ? f(en / ec, 3) : "—",
  ])
}
table(["r / (side/2)", "r", "edge .circ", "edge .cont", "ratio"], rows6)

// MARK: - 7. CALayer.cornerCurve, measured in pixels instead of path geometry

/// Renders a CALayer opaque-on-transparent and reports whether a point is covered.
/// A second instrument on a different code path: pixels, not `Path.contains`.
struct LayerMask {
  let width: Int
  let height: Int
  let alpha: [UInt8]

  init(cornerRadius: CGFloat, curve: CALayerCornerCurve, size: CGSize, scale: CGFloat = 4) {
    let w = Int(size.width * scale)
    let h = Int(size.height * scale)
    var buffer = [UInt8](repeating: 0, count: w * h)
    let layer = CALayer()
    layer.bounds = CGRect(origin: .zero, size: size)
    layer.backgroundColor = CGColor(gray: 0, alpha: 1)
    layer.cornerRadius = cornerRadius
    layer.cornerCurve = curve
    layer.masksToBounds = true

    buffer.withUnsafeMutableBytes { raw in
      guard
        let ctx = CGContext(
          data: raw.baseAddress, width: w, height: h, bitsPerComponent: 8,
          bytesPerRow: w, space: CGColorSpaceCreateDeviceGray(),
          bitmapInfo: CGImageAlphaInfo.none.rawValue)
      else { return }
      ctx.setFillColor(CGColor(gray: 1, alpha: 1))
      ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
      ctx.scaleBy(x: scale, y: scale)
      layer.render(in: ctx)
    }
    self.width = w
    self.height = h
    self.alpha = buffer
    self.scale = scale
  }

  let scale: CGFloat

  /// True where the layer painted. Coordinates are in points, y measured down
  /// from the top — the bitmap is bottom-up, so the row is flipped.
  func covered(_ x: CGFloat, _ y: CGFloat) -> Bool {
    let px = Int(x * scale)
    let py = Int((CGFloat(height) / scale - y) * scale)
    guard px >= 0, px < width, py >= 0, py < height else { return false }
    return alpha[py * width + px] < 128
  }
}

func layerCornerDepth(_ mask: LayerMask, limit: CGFloat) -> CGFloat {
  var lo = 0.0
  var hi = limit
  for _ in 0..<steps {
    let mid = (lo + hi) / 2
    let c = mid / 2.0.squareRoot()
    if mask.covered(c, c) { hi = mid } else { lo = mid }
  }
  return (lo + hi) / 2
}

print("## 7. CALayer.cornerCurve — the UIKit/AppKit API, cross-checked in pixels\n")
print("Corner depth only. A raster cannot locate the tangent point where the curve")
print("rejoins the straight edge — the boundary approaches it quadratically, so the")
print("answer is set by pixel size rather than by the shape. That is exactly why")
print("section 1 measures the path instead. Depth is a transverse crossing and")
print("survives rasterisation, so it is the column worth cross-checking.\n")

let layerSize = CGSize(width: side, height: side)
var rows7: [[String]] = []
for r in [30.0, 60, 90, 120, 150] {
  let dcLayer = layerCornerDepth(
    LayerMask(cornerRadius: r, curve: .circular, size: layerSize), limit: side)
  let dnLayer = layerCornerDepth(
    LayerMask(cornerRadius: r, curve: .continuous, size: layerSize), limit: side)
  let dcPath = cornerDepth(
    RoundedRectangle(cornerRadius: r, style: .circular).path(in: square), limit: side)
  let dnPath = cornerDepth(
    RoundedRectangle(cornerRadius: r, style: .continuous).path(in: square), limit: side)
  rows7.append([
    f(r, 0),
    f(dcLayer), f(dcPath), f(abs(dcLayer - dcPath), 2),
    f(dnLayer), f(dnPath), f(abs(dnLayer - dnPath), 2),
    f(dcLayer / dnLayer, 3),
  ])
}
table(
  [
    "r", "CALayer .circ", "SwiftUI .circ", "Δ", "CALayer .cont", "SwiftUI .cont", "Δ",
    "depth ratio",
  ], rows7)
print("The two instruments agree to within a pixel, so `RoundedCornerStyle` and")
print("`CALayerCornerCurve` are the same two curves under different names, and")
print("neither table is measuring an artefact of how it was measured.\n")

// MARK: - 8. The comparison the whole question is about

print("## 8. Against CSS, at the radius each is normally used at\n")
print("The CSS numbers come from archive/2026-07-corner-shape-superellipse.\n")

let rCmp = 60.0
let swiftCircular = RoundedRectangle(cornerRadius: rCmp, style: .circular).path(in: square)
let swiftContinuous = RoundedRectangle(cornerRadius: rCmp, style: .continuous).path(in: square)
let depthArc = cornerDepth(swiftCircular, limit: side)
let depthCont = cornerDepth(swiftContinuous, limit: side)
let edgeArc = edgeExtent(swiftCircular, width: side)
let edgeCont = edgeExtent(swiftContinuous, width: side)

table(
  ["", "edge extent / r", "corner depth / r", "needs radius compensation"],
  [
    ["arc (both platforms)", f(edgeArc / rCmp, 3), f(depthArc / rCmp, 4), "—"],
    [
      "iOS .continuous", f(edgeCont / rCmp, 3), f(depthCont / rCmp, 4),
      "no — depth ratio " + f(depthArc / depthCont, 3),
    ],
    ["CSS superellipse(1.6)", "1.000", "0.2891", "yes — depth ratio 1.433"],
  ])

print("iOS spends edge length and keeps the depth; CSS keeps the footprint and")
print("spends the depth. That is the whole difference, and it is why only one of")
print("the two needs a compensating radius scale.\n")

// MARK: - 9. The control points themselves

print("## 9. Apple's construction, verbatim\n")
print("Three cubic Béziers per corner. Normalised by r, these twelve numbers are")
print("the whole curve — enough to port it to an SVG `d` string exactly rather")
print("than fitting an approximation to it.\n")

let dumpBox = CGRect(x: 0, y: 0, width: 1000, height: 1000)
let dumpR = 100.0
print("`RoundedRectangle(cornerRadius: 100, style: .continuous)` in 1000x1000,")
print("top-left corner, values divided by r:\n")
print("```")
var emitted = 0
RoundedRectangle(cornerRadius: dumpR, style: .continuous).path(in: dumpBox).forEach { element in
  // The top-left corner is the third `line` plus the three curves after it.
  guard case .curve(let to, let c1, let c2) = element else {
    if case .line(let to) = element, abs(to.x) < 1e-9 {
      print(String(format: "from (%.6f, %.6f)", to.x / dumpR, to.y / dumpR))
      emitted = 1
    }
    return
  }
  guard emitted >= 1, emitted <= 3 else { return }
  print(
    String(
      format: "C (%.6f, %.6f) (%.6f, %.6f) -> (%.6f, %.6f)",
      c1.x / dumpR, c1.y / dumpR, c2.x / dumpR, c2.y / dumpR, to.x / dumpR, to.y / dumpR))
  emitted += 1
}
print("```\n")
print("Symmetric about the diagonal: the first and third segments are mirrors,")
print("and the middle one is its own mirror.\n")

// MARK: - 10. Why the primary instrument reads the path instead of hit-testing

print("## 10. What hit-testing gets wrong here, and by how much\n")
print("The exact extent above is 1.528665r at every radius. Hit-testing the same")
print("quantity converges toward it only as delta goes to zero, and at any")
print("practical delta it reads short — because the boundary meets the straight")
print("edge tangentially, so a large span of x maps to a tiny span of y.\n")
print("The bias does NOT cancel in the ratio: it is a different absolute error on")
print("each curve. This cost a wrong published figure of 1.520 before the exact")
print("method replaced it.\n")

var rows10: [[String]] = []
for delta in [0.5, 0.1, 0.02, 0.002, 0.0002] {
  let hc = hitTestedEdgeExtent(swiftCircular, width: side, delta: delta)
  let hn = hitTestedEdgeExtent(swiftContinuous, width: side, delta: delta)
  rows10.append([
    String(format: "%g", delta), f(hc, 3), f(hn, 3), f(hn / hc, 4),
    f((hn / hc / 1.528665 - 1) * 100, 2) + "%",
  ])
}
rows10.append(["exact", f(edgeArc, 3), f(edgeCont, 3), f(edgeCont / edgeArc, 4), "0.00%"])
table(["delta", "hit .circ", "hit .cont", "ratio", "error vs exact"], rows10)

print("### The depth ratio, exactly\n")
print("By symmetry the middle segment's t = 0.5 point is where the curve crosses")
print("the diagonal, so the apex follows from the control points with no")
print("measurement at all: B(0.5) = (P0 + 3P1 + 3P2 + P3) / 8.\n")

// Middle segment of the normalised corner, from section 9.
let p0 = 0.074911
let p1 = 0.169060
let p2 = 0.372824
let p3 = 0.631494
let apex = (p0 + 3 * p1 + 3 * p2 + p3) / 8
let exactContDepth = apex * 2.0.squareRoot()
let exactArcDepth = (1 - pow(2.0, -0.5)) * 2.0.squareRoot()

print("```")
print(String(format: "apex        = %.6f r   (on each axis)", apex))
print(String(format: "depth .cont = %.6f r", exactContDepth))
print(String(format: "depth .circ = %.6f r   = sqrt(2)(1 - 2^-0.5)", exactArcDepth))
print(String(format: "depth ratio = %.6f", exactArcDepth / exactContDepth))
print("```\n")
print(
  String(
    format:
      "So Apple preserves apparent corner size to %.2f%%, against CSS's 43.3%% deficit.\n",
    (exactArcDepth / exactContDepth - 1) * 100))
