// Puts real `NSGlassEffectView` on top of backgrounds chosen to make the effect
// measurable rather than pretty, and — in `--measure` mode — reads the composited
// pixels back and prints numbers.
//
//   xcrun swiftc -parse-as-library demo-glass.swift -o demo-glass && ./demo-glass
//   ./demo-glass --measure                       # captures its own window, prints scanlines
//   ./demo-glass --measure --out __screenshots__ # same, and keeps the captures as PNGs
//
// The three backgrounds each isolate one thing:
//
//   grid  — vertical stripes at a known period. Tracking stripe centres along a
//           scanline recovers the *displacement profile* across the rim, because a
//           periodic signal gives you a reading at every x rather than just one.
//   edge  — a single black→white step. One edge means the dispersion fringe is not
//           contaminated by neighbouring stripes, so the fringe colours are readable
//           straight off the scanline. This is the one that answers "is the dispersion
//           basis actually R/G/B".
//   card  — flat colour swatches. Flat regions cancel refraction entirely, so what is
//           left is the colour transform: tint, saturation, and the face colour matrix.
//
// `--measure` needs Screen Recording permission, because the glass is composited by
// the window server: `CALayer.render(in:)` and `cacheDisplay(in:to:)` both skip
// backdrop filters, so an in-process render would capture the background unrefracted
// and silently report zero displacement. Capturing the real window is the only way to
// see what actually shipped. macOS will prompt on first run; without it the probe says
// so and exits rather than printing wrong numbers.

import AppKit
import ScreenCaptureKit

// MARK: - Backgrounds

private enum Background: String, CaseIterable {
  case grid, edge, card

  var label: String {
    switch self {
    case .grid: return "Stripes (displacement)"
    case .edge: return "Step edge (dispersion)"
    case .card: return "Colour card (tone)"
    }
  }
}

/// Stripe period in points. It has to be coarse enough to survive the interior blur —
/// at 16 pt the `.regular` style washes the stripes out completely and the probe reports
/// no crossings at all inside the glass, which reads as "no displacement" when it really
/// means "no signal". Even, so a 2× backing store lands on whole pixels.
private let stripePeriod: CGFloat = 48

/// Where the step edge sits, in points from the left of the background view.
///
/// Deliberately just inside the glass's left rim rather than in the middle: the centre
/// of the glass is optically flat, so a step edge there is not refracted and shows no
/// fringe at all. The dispersion only exists where the surface is curved.
private let stepEdgeX: CGFloat = 152

private let swatches: [(String, NSColor)] = [
  ("black", .black),
  ("white", .white),
  ("mid-grey", NSColor(white: 0.5, alpha: 1)),
  ("red", NSColor(srgbRed: 1, green: 0, blue: 0, alpha: 1)),
  ("green", NSColor(srgbRed: 0, green: 1, blue: 0, alpha: 1)),
  ("blue", NSColor(srgbRed: 0, green: 0, blue: 1, alpha: 1)),
  ("cyan", NSColor(srgbRed: 0, green: 1, blue: 1, alpha: 1)),
  ("magenta", NSColor(srgbRed: 1, green: 0, blue: 1, alpha: 1)),
  ("yellow", NSColor(srgbRed: 1, green: 1, blue: 0, alpha: 1)),
]

private final class BackgroundView: NSView {
  var background: Background = .grid { didSet { needsDisplay = true } }

  override var isOpaque: Bool { true }

  override func draw(_: NSRect) {
    let b = bounds
    switch background {
    case .grid:
      NSColor.black.setFill()
      b.fill()
      NSColor.white.setFill()
      var x = b.minX
      while x < b.maxX {
        NSRect(x: x, y: b.minY, width: stripePeriod / 2, height: b.height).fill()
        x += stripePeriod
      }
    case .edge:
      NSColor.black.setFill()
      b.fill()
      NSColor.white.setFill()
      NSRect(x: b.minX + stepEdgeX, y: b.minY, width: b.width, height: b.height).fill()
    case .card:
      let h = b.height / CGFloat(swatches.count)
      for (i, entry) in swatches.enumerated() {
        entry.1.setFill()
        NSRect(x: b.minX, y: b.maxY - CGFloat(i + 1) * h, width: b.width, height: h).fill()
      }
    }
  }
}

// MARK: - Draggable glass

private final class DraggableGlass: NSGlassEffectView {
  override func mouseDown(with _: NSEvent) {}

  override func mouseDragged(with event: NSEvent) {
    var f = frame
    f.origin.x += event.deltaX
    f.origin.y -= event.deltaY  // AppKit's y is up; deltaY is screen-down
    frame = f
  }
}

// MARK: - Pixel analysis

private struct Bitmap {
  let width: Int
  let height: Int
  let scale: Int
  private let px: [UInt8]  // RGBA8, sRGB, row-major

  init?(_ image: CGImage, pointWidth: Int) {
    width = image.width
    height = image.height
    scale = max(1, image.width / max(pointWidth, 1))

    // The context keeps the pointer for as long as it lives, so the storage has to
    // outlive this scope. Passing `&array` here would let the buffer move and is how
    // this crashed the first time round.
    let count = width * height * 4
    let raw = UnsafeMutablePointer<UInt8>.allocate(capacity: count)
    raw.initialize(repeating: 0, count: count)
    defer { raw.deallocate() }

    guard let ctx = CGContext(data: raw, width: width, height: height,
                              bitsPerComponent: 8, bytesPerRow: width * 4,
                              space: CGColorSpace(name: CGColorSpace.sRGB)!,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return nil }
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    px = Array(UnsafeBufferPointer(start: raw, count: count))
  }

  /// Row 0 is the top of the image, matching CGImage rather than AppKit.
  func rgb(_ x: Int, _ y: Int) -> (Double, Double, Double) {
    guard x >= 0, x < width, y >= 0, y < height else { return (0, 0, 0) }
    let i = (y * width + x) * 4
    return (Double(px[i]) / 255, Double(px[i + 1]) / 255, Double(px[i + 2]) / 255)
  }

  func luma(_ x: Int, _ y: Int) -> Double {
    let (r, g, b) = rgb(x, y)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b  // Rec.709, same weights the shader uses
  }
}

private func hueDegrees(_ r: Double, _ g: Double, _ b: Double) -> Double {
  let maxC = max(r, g, b), minC = min(r, g, b)
  let d = maxC - minC
  if d < 1e-6 { return -1 }  // achromatic
  var h: Double
  if maxC == r { h = (g - b) / d }
  else if maxC == g { h = 2 + (b - r) / d }
  else { h = 4 + (r - g) / d }
  h *= 60
  return h < 0 ? h + 360 : h
}

private func chroma(_ r: Double, _ g: Double, _ b: Double) -> Double {
  max(r, g, b) - min(r, g, b)
}

/// Low enough to catch a fringe that is only a few 8-bit codes wide, high enough to stay
/// above the capture's own dither.
private let chromaFloor = 0.008

// MARK: - Measurement

/// Sub-pixel positions of white-stripe centres along a scanline, via zero crossings of
/// (luma - 0.5). Stripe centres are what move under refraction, so their spacing is a
/// direct readout of the local displacement gradient.
private func stripeCrossings(_ bmp: Bitmap, row: Int, from x0: Int, to x1: Int) -> [Double] {
  var out: [Double] = []
  var prev = bmp.luma(x0, row) - 0.5
  for x in (x0 + 1) ..< x1 {
    let cur = bmp.luma(x, row) - 0.5
    if (prev < 0) != (cur < 0), abs(cur - prev) > 1e-9 {
      out.append(Double(x - 1) + Double(-prev / (cur - prev)))
    }
    prev = cur
  }
  return out
}

/// Prints every chromatic pixel on a scanline. The backgrounds are all greyscale except
/// the colour card, so on `grid` and `edge` any colour at all *is* the dispersion
/// fringe — no need to model what the hue should have been.
private func reportChroma(_ bmp: Bitmap, row: Int, rect r: CGRect) {
  print("\nchromatic pixels on the scanline (chroma > \(chromaFloor)):")
  print("      x    d_rim        R      G      B   chroma     hue")
  var hits: [(Int, Double, Double, Double, Double, Double)] = []
  for x in 0 ..< bmp.width {
    let (rr, gg, bb) = bmp.rgb(x, row)
    let c = chroma(rr, gg, bb)
    guard c > chromaFloor else { continue }
    hits.append((x, rr, gg, bb, c, hueDegrees(rr, gg, bb)))
  }
  guard !hits.isEmpty else {
    print("  (none — no dispersion on this scanline)")
    return
  }
  // Only the rim matters, and printing 700 rows helps nobody: keep pixels within 60 px
  // of either rim, which is where the curvature lives.
  for (x, rr, gg, bb, c, h) in hits {
    let dxFromRim = min(Double(x) - r.minX, r.maxX - Double(x))
    guard abs(dxFromRim) < 60 else { continue }
    print(String(format: "  %5d  %+8.2f   %.4f %.4f %.4f   %.4f  %6.1f°",
                 x, dxFromRim, rr, gg, bb, c, h))
  }
  let peak = hits.max { $0.4 < $1.4 }!
  print(String(format: "  → %d chromatic px; peak chroma %.4f at x=%d, hue %.1f°",
               hits.count, peak.4, peak.0, peak.5))
}

/// A single scanline can miss a fringe that only appears on, say, the top rim, so before
/// concluding "no dispersion" sweep the whole glass and its surroundings for the most
/// chromatic pixel anywhere. Against a greyscale background any chroma at all is signal.
private func reportPeakChroma(_ bmp: Bitmap, rect r: CGRect) {
  var best = (c: -1.0, x: 0, y: 0, rgb: (0.0, 0.0, 0.0))
  var above = 0
  let y0 = max(0, Int(r.minY) - 20), y1 = min(bmp.height - 1, Int(r.maxY) + 20)
  let x0 = max(0, Int(r.minX) - 20), x1 = min(bmp.width - 1, Int(r.maxX) + 20)
  for y in stride(from: y0, to: y1, by: 1) {
    for x in stride(from: x0, to: x1, by: 1) {
      let (rr, gg, bb) = bmp.rgb(x, y)
      let c = chroma(rr, gg, bb)
      if c > chromaFloor { above += 1 }
      if c > best.c { best = (c, x, y, (rr, gg, bb)) }
    }
  }
  print(String(format: "2D sweep over glass±20px (%d×%d px): %d px above chroma %.3f",
               x1 - x0, y1 - y0, above, chromaFloor))
  print(String(format: "  peak chroma %.4f at (%d, %d) rgb=(%.4f, %.4f, %.4f) hue %.1f°",
               best.c, best.x, best.y, best.rgb.0, best.rgb.1, best.rgb.2,
               hueDegrees(best.rgb.0, best.rgb.1, best.rgb.2)))
}

/// Recorded at capture time. AppKit flattens materials in inactive windows, so a rig that
/// captures while the terminal still owns focus would measure the wrong thing.
private var windowWasKey = false
private var appWasActive = false

private func report(_ bmp: Bitmap, background: Background, glassRectInImage: CGRect) {
  let r = glassRectInImage
  let row = Int(r.midY)
  print("── capture \(bmp.width)×\(bmp.height) px, scale \(bmp.scale)×, background=\(background.rawValue)")
  print("── glass rect in image px: x \(Int(r.minX))…\(Int(r.maxX)), y \(Int(r.minY))…\(Int(r.maxY))")
  print("── scanline y=\(row) (glass vertical centre)")
  print("── window key=\(windowWasKey) app active=\(appWasActive)\n")

  switch background {
  case .grid:
    // The reference scanline has to be background-only: above the glass but below the
    // titlebar, which is inside the captured image.
    let refRow = max(4, Int(r.minY) - 60)
    let outside = stripeCrossings(bmp, row: refRow, from: 0, to: bmp.width - 1)
    let inside = stripeCrossings(bmp, row: row, from: 0, to: bmp.width - 1)
    let period = zip(outside.dropFirst(), outside).map(-).filter { $0 > 1 }
    let nominal = period.reduce(0, +) / Double(max(period.count, 1))
    print("reference scanline y=\(refRow), \(outside.count) crossings, "
          + "mean spacing \(String(format: "%.3f", nominal)) px "
          + "(expected \(String(format: "%.1f", Double(bmp.scale) * Double(stripePeriod) / 2)))")
    print("\ncrossing displacement under the glass (px, + = pulled right):")
    for c in inside where c >= r.minX - 30 && c <= r.maxX + 30 {
      // Nearest undisturbed crossing tells us where this feature "should" be.
      guard let ref = outside.min(by: { abs($0 - c) < abs($1 - c) }) else { continue }
      let dxFromRim = min(c - r.minX, r.maxX - c)
      print(String(format: "  x=%8.2f  d_rim=%+8.2f  shift=%+7.2f", c, dxFromRim, c - ref))
    }
    reportChroma(bmp, row: row, rect: r)

  case .edge:
    reportChroma(bmp, row: row, rect: r)
    reportPeakChroma(bmp, rect: r)

  case .card:
    // One sample from the middle of each swatch, inside the glass and outside it, so the
    // colour transform can be read as a mapping between the two.
    print("swatch    outside glass (R,G,B)      inside glass (R,G,B)        Δluma")
    let bandHeight = Double(bmp.height) / Double(swatches.count)
    for (i, entry) in swatches.enumerated() {
      let y = Int((Double(i) + 0.5) * bandHeight)
      guard Double(y) > r.minY + 12, Double(y) < r.maxY - 12 else { continue }
      let xOut = max(4, Int(r.minX) - 40)
      let xIn = Int(r.midX)
      let o = bmp.rgb(xOut, y), n = bmp.rgb(xIn, y)
      // %s takes a C string, not a Swift String — pad in Swift instead.
      let name = entry.0.padding(toLength: 9, withPad: " ", startingAt: 0)
      print(name + String(format: " (%.4f, %.4f, %.4f)   (%.4f, %.4f, %.4f)   %+.4f",
                          o.0, o.1, o.2, n.0, n.1, n.2,
                          bmp.luma(xIn, y) - bmp.luma(xOut, y)))
    }
  }
  print()
}

// MARK: - App

@main
final class Demo: NSObject, NSApplicationDelegate {
  static func main() {
    let app = NSApplication.shared
    let demo = Demo()
    app.delegate = demo
    app.setActivationPolicy(.regular)
    app.run()
  }

  private let measuring = CommandLine.arguments.contains("--measure")

  /// `--out DIR` keeps every capture as a PNG next to the numbers, so the figures in the
  /// README come from the same run as the measurements rather than a separate screenshot.
  private let outDir: URL? = {
    let args = CommandLine.arguments
    guard let i = args.firstIndex(of: "--out"), i + 1 < args.count else { return nil }
    return URL(fileURLWithPath: args[i + 1])
  }()
  private var window: NSWindow!
  private var backgroundView: BackgroundView!
  private var glass: DraggableGlass!

  private let contentSize = CGSize(width: 640, height: 460)

  func applicationDidFinishLaunching(_: Notification) {
    let frame = NSRect(origin: .zero, size: contentSize)
    window = NSWindow(contentRect: frame,
                      styleMask: [.titled, .closable, .resizable],
                      backing: .buffered, defer: false)
    window.title = "Liquid Glass — measurement rig"
    window.isReleasedWhenClosed = false

    backgroundView = BackgroundView(frame: frame)
    backgroundView.autoresizingMask = [.width, .height]

    glass = DraggableGlass(frame: NSRect(x: 140, y: 130, width: 360, height: 200))
    glass.cornerRadius = 46
    glass.style = .regular
    backgroundView.addSubview(glass)

    window.contentView = backgroundView
    window.center()
    window.makeKeyAndOrderFront(nil)

    if measuring {
      NSApp.activate()
      // One background at a time, each given a moment to render before capture. The
      // glass composites on the window server, so a display() is not enough — the
      // frame has to actually reach the screen.
      Task { await self.measureAll() }
    } else {
      installControls()
    }
  }

  private func installControls() {
    let picker = NSSegmentedControl(labels: Background.allCases.map(\.label),
                                   trackingMode: .selectOne,
                                   target: self, action: #selector(pickBackground(_:)))
    picker.selectedSegment = 0
    picker.frame = NSRect(x: 12, y: contentSize.height - 34, width: 500, height: 24)
    backgroundView.addSubview(picker, positioned: .above, relativeTo: glass)

    let style = NSSegmentedControl(labels: ["regular", "clear"], trackingMode: .selectOne,
                                  target: self, action: #selector(pickStyle(_:)))
    style.selectedSegment = 0
    style.frame = NSRect(x: 12, y: 12, width: 160, height: 24)
    backgroundView.addSubview(style, positioned: .above, relativeTo: glass)

    let radius = NSSlider(value: 46, minValue: 0, maxValue: 100,
                          target: self, action: #selector(setRadius(_:)))
    radius.frame = NSRect(x: 184, y: 12, width: 200, height: 24)
    backgroundView.addSubview(radius, positioned: .above, relativeTo: glass)

    let hint = NSTextField(labelWithString: "drag the glass · slider = cornerRadius")
    hint.textColor = .white
    hint.frame = NSRect(x: 396, y: 14, width: 240, height: 20)
    backgroundView.addSubview(hint, positioned: .above, relativeTo: glass)
  }

  @objc private func pickBackground(_ sender: NSSegmentedControl) {
    backgroundView.background = Background.allCases[sender.selectedSegment]
  }

  @objc private func pickStyle(_ sender: NSSegmentedControl) {
    glass.style = sender.selectedSegment == 0 ? .regular : .clear
  }

  @objc private func setRadius(_ sender: NSSlider) {
    glass.cornerRadius = CGFloat(sender.doubleValue)
  }

  @MainActor
  private func measureAll() async {
    for (styleName, style) in [("regular", NSGlassEffectView.Style.regular),
                               ("clear", NSGlassEffectView.Style.clear)] {
    glass.style = style
    print("\n\n########## style = .\(styleName) ##########\n")
    for background in Background.allCases {
      backgroundView.background = background
      backgroundView.display()
      // Two runloop turns plus a frame of slack: the capture has to see the composited
      // result, not the frame before the background changed.
      windowWasKey = window.isKeyWindow
      appWasActive = NSApp.isActive
      guard let image = await captureSettled(background) else {
        print("!! capture failed — grant Screen Recording to this binary in")
        print("!! System Settings › Privacy & Security › Screen & System Audio Recording,")
        print("!! then run again. Refusing to print numbers from an in-process render,")
        print("!! which would miss the backdrop filter entirely.")
        NSApp.terminate(nil)
        return
      }
      if let outDir {
        try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
        let name = "glass-\(styleName)-\(background.rawValue).png"
        let rep = NSBitmapImageRep(cgImage: image)
        rep.size = NSSize(width: image.width, height: image.height)
        if let png = rep.representation(using: .png, properties: [:]) {
          try? png.write(to: outDir.appendingPathComponent(name))
          print("wrote \(name) (\(image.width)×\(image.height))")
        }
      }
      guard let bmp = Bitmap(image, pointWidth: Int(window.frame.width)) else { continue }

      // Glass frame is in view coordinates (y up, origin at the content view's
      // bottom-left). The capture is y-down and includes the titlebar, so convert.
      let contentInWindow = window.contentView!.frame
      let titleBar = window.frame.height - contentInWindow.height
      let s = CGFloat(bmp.scale)
      let g = glass.frame
      let rect = CGRect(x: g.minX * s,
                        y: (titleBar + contentInWindow.height - g.maxY) * s,
                        width: g.width * s, height: g.height * s)
      report(bmp, background: background, glassRectInImage: rect)
    }
    }
    NSApp.terminate(nil)
  }

  /// Captures until the glass is demonstrably *drawn*, then until the frame stops changing.
  ///
  /// Frame stability alone is not enough, and getting that wrong cost two rounds of false
  /// findings. Before the window server composites the effect, the capture shows the
  /// background unstyled — and consecutive captures of a not-yet-rendered glass are
  /// perfectly stable, so a "wait for two equal frames" rule accepts it happily. The
  /// reading that comes back looks like near-perfect transparency, which is exactly what a
  /// plausible-but-wrong result looks like.
  ///
  /// So the gate is positive: every background here is uniform along one axis, which means
  /// the un-glassed backdrop under the glass is *known*. If the glass region still matches
  /// it, the effect is not on the frame yet.
  @MainActor
  private func captureSettled(_ background: Background) async -> CGImage? {
    var previous: UInt64?
    for attempt in 1 ... 20 {
      try? await Task.sleep(nanoseconds: 200_000_000)
      guard let image = await capture() else { return nil }
      guard let bmp = Bitmap(image, pointWidth: Int(window.frame.width)) else { return nil }

      if glassIsDrawn(bmp, background: background) {
        let h = fingerprint(image)
        if previous == h {
          if attempt > 3 { print("   (settled after \(attempt) captures)") }
          return image
        }
        previous = h
      } else {
        previous = nil  // not drawn yet; do not let stability count toward settling
      }
    }
    print("!! glass never appeared after 20 captures — refusing to report numbers")
    return nil
  }

  /// True when the glass region differs from the backdrop it covers.
  ///
  /// `grid` and `edge` are uniform vertically, so a point inside the glass is compared with
  /// the same column above it. `card` is uniform horizontally, so it is compared along the
  /// row instead.
  @MainActor
  private func glassIsDrawn(_ bmp: Bitmap, background: Background) -> Bool {
    let s = CGFloat(bmp.scale)
    let contentInWindow = window.contentView!.frame
    let titleBar = window.frame.height - contentInWindow.height
    let g = glass.frame
    let minX = Int(g.minX * s), maxX = Int(g.maxX * s)
    let minY = Int((titleBar + contentInWindow.height - g.maxY) * s)
    let maxY = Int((titleBar + contentInWindow.height - g.minY) * s)

    let insideX = (minX + maxX) / 2, insideY = (minY + maxY) / 2
    let (refX, refY) = background == .card
      ? (max(4, minX - 40), insideY)     // same row, outside the glass
      : (insideX, max(4, minY - 40))     // same column, above the glass
    return abs(bmp.luma(insideX, insideY) - bmp.luma(refX, refY)) > 0.02
  }

  /// Cheap content hash over a strided sample of the image, enough to tell "glass drawn"
  /// from "glass not drawn yet" without allocating a second full bitmap.
  private func fingerprint(_ image: CGImage) -> UInt64 {
    guard let data = image.dataProvider?.data,
          let bytes = CFDataGetBytePtr(data) else { return 0 }
    let n = CFDataGetLength(data)
    var h: UInt64 = 0xcbf2_9ce4_8422_2325
    for i in stride(from: 0, to: n, by: 997) {
      h = (h ^ UInt64(bytes[i])) &* 0x100_0000_01b3
    }
    return h
  }

  @MainActor
  private func capture() async -> CGImage? {
    do {
      let content = try await SCShareableContent.excludingDesktopWindows(
        false, onScreenWindowsOnly: true)
      guard let win = content.windows.first(where: {
        $0.owningApplication?.processID == getpid() && $0.frame.width > 100
      }) else { return nil }

      let config = SCStreamConfiguration()
      config.width = Int(win.frame.width * 2)
      config.height = Int(win.frame.height * 2)
      config.captureResolution = .best
      config.showsCursor = false
      config.colorSpaceName = CGColorSpace.sRGB

      let filter = SCContentFilter(desktopIndependentWindow: win)
      return try await SCScreenshotManager.captureImage(contentFilter: filter,
                                                        configuration: config)
    } catch {
      print("!! ScreenCaptureKit: \(error.localizedDescription)")
      return nil
    }
  }
}
