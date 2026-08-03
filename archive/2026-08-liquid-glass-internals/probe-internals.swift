// Dumps what AppKit actually builds when you ask for Liquid Glass: the private
// Core Animation layer tree under `NSGlassEffectView`, and the parameters of the
// private `CAFilter` objects hanging off it.
//
//   xcrun swiftc -parse-as-library probe-internals.swift -o probe-internals && ./probe-internals
//
// Nothing here is public API. The point is not to *use* these classes but to read
// the numbers Apple chose, so a re-implementation can be checked against them rather
// than tuned by eye. Everything is read-only: no private setters are called.
//
// The window is placed off-screen and the process exits on its own, so this can run
// while you keep working. No screen-recording permission is needed — the layer tree
// is built in this process, before anything is handed to the render server.
//
// Ivars are read through raw offsets rather than KVC on purpose: KVC on a key a class
// does not implement raises an Objective-C exception, which Swift cannot catch, and
// CAFilter has plenty of ivars with no matching property.

import AppKit
import QuartzCore

// MARK: - Objective-C runtime helpers

private func fmt(_ d: Double) -> String {
  if d == d.rounded() && abs(d) < 1e9 { return String(format: "%g", d) }
  return String(format: "%.6g", d)
}

/// Compact one-line rendering, expanding the containers CAFilter actually uses.
private func describe(_ value: AnyObject?) -> String {
  guard let value else { return "nil" }
  switch value {
  case let n as NSNumber: return fmt(n.doubleValue)
  case let s as NSString: return "\"\(s)\""
  case let a as NSArray:
    return "[" + a.map { describe($0 as AnyObject) }.joined(separator: ", ") + "]"
  case let d as NSDictionary:
    return "{" + d.map { "\($0.key): \(describe($0.value as AnyObject))" }.sorted()
      .joined(separator: ", ") + "}"
  case let c as NSColor:
    guard let rgb = c.usingColorSpace(.sRGB) else { return "\(c)" }
    return String(format: "sRGB(%.4f, %.4f, %.4f, %.4f)",
                  rgb.redComponent, rgb.greenComponent, rgb.blueComponent, rgb.alphaComponent)
  default: break
  }
  if CFGetTypeID(value) == CGColor.typeID {
    let cg = unsafeBitCast(value, to: CGColor.self)
    let comps = (cg.components ?? []).map { fmt(Double($0)) }.joined(separator: ", ")
    let space = cg.colorSpace?.name as String? ?? "?"
    return "CGColor[\(space)](\(comps))"
  }
  return "<\(String(describing: Swift.type(of: value)))>"
}

/// Reads one ivar by raw offset, decoding the common scalar encodings. Anything exotic
/// is reported as its type encoding so it shows up as a gap rather than a wrong number.
private func readIvar(_ obj: AnyObject, _ ivar: Ivar) -> String {
  let encoding = ivar_getTypeEncoding(ivar).flatMap { String(validatingCString: $0) } ?? "?"
  let base = unsafeBitCast(obj, to: UnsafeRawPointer.self).advanced(by: ivar_getOffset(ivar))

  switch encoding.first {
  case "@":
    guard let ptr = base.load(as: UnsafeRawPointer?.self) else { return "nil" }
    return describe(unsafeBitCast(ptr, to: AnyObject.self))
  case "f": return fmt(Double(base.load(as: Float.self)))
  case "d": return fmt(base.load(as: Double.self))
  case "B", "c", "C": return "\(base.load(as: Int8.self))"
  case "s", "S": return "\(base.load(as: Int16.self))"
  case "i", "I": return "\(base.load(as: Int32.self))"
  case "q", "Q": return "\(base.load(as: Int64.self))"
  // Structs are laid out inline; CGRect/CGPoint/CGSize are the ones worth decoding.
  case "{":
    if encoding.hasPrefix("{CGRect") {
      let r = base.load(as: CGRect.self)
      return String(format: "(%.2f, %.2f, %.2f, %.2f)", r.minX, r.minY, r.width, r.height)
    }
    if encoding.hasPrefix("{CGPoint") {
      let p = base.load(as: CGPoint.self)
      return String(format: "(%.2f, %.2f)", p.x, p.y)
    }
    if encoding.hasPrefix("{CGSize") {
      let s = base.load(as: CGSize.self)
      return String(format: "(%.2f, %.2f)", s.width, s.height)
    }
    return "<\(encoding.prefix(40))>"
  default: return "<\(encoding.prefix(20))>"
  }
}

private func dumpIvars(of obj: AnyObject, indent: String, skipEmpty: Bool = true) {
  var cls: AnyClass? = Swift.type(of: obj)
  while let c = cls, c !== NSObject.self {
    var count: UInt32 = 0
    guard let list = class_copyIvarList(c, &count) else { cls = class_getSuperclass(c); continue }
    for i in 0 ..< Int(count) {
      let ivar = list[i]
      guard let raw = ivar_getName(ivar), let name = String(validatingCString: raw) else { continue }
      let value = readIvar(obj, ivar)
      if skipEmpty, value == "nil" || value == "0" || value.hasPrefix("<") { continue }
      print("\(indent)\(name) = \(value)")
    }
    free(list)
    cls = class_getSuperclass(c)
  }
}

/// `-[CAFilter description]` is terse, so build our own: the filter type plus every
/// ivar carrying a value.
private func describeFilter(_ filter: AnyObject, indent: String) {
  let cls = String(describing: Swift.type(of: filter))
  let obj = filter as? NSObject
  let type = obj?.responds(to: NSSelectorFromString("type")) == true
    ? (obj?.value(forKey: "type") as? String ?? "<untyped>") : "<no type>"
  print("\(indent)\(cls) type=\(type)")
  print("\(indent)  description: \(String(describing: filter))")

  // `inputKeys` names the knobs Apple itself treats as inputs — a better list than
  // raw ivars when it exists, because those keys are guaranteed KVC-safe.
  if let obj, obj.responds(to: NSSelectorFromString("inputKeys")),
     let keys = obj.value(forKey: "inputKeys") as? [String] {
    for key in keys.sorted() where obj.responds(to: NSSelectorFromString(key)) {
      print("\(indent)  \(key) = \(describe(obj.value(forKey: key) as AnyObject?))")
    }
  }
  dumpIvars(of: filter, indent: indent + "  ivar ")
}

// MARK: - Layer tree walk

// CALayer implements `valueForUndefinedKey:` to return nil, so probing speculative
// keys on it is safe — unlike on CAFilter.
private let speculativeLayerKeys = [
  "inputSourceSublayerName", "groupName", "effects", "sdfEffects", "shapeLayers",
  "glassEffect", "style", "mode", "blurRadius", "saturation", "scale", "shape",
  "cornerRadii", "sdfShape", "elements", "highlightAngle", "tint",
]

private func walk(_ layer: CALayer, depth: Int) {
  let indent = String(repeating: "  ", count: depth)
  let cls = String(describing: Swift.type(of: layer))
  let name = layer.name.map { " name=\"\($0)\"" } ?? ""
  let f = layer.frame
  print(String(format: "%@%@%@ frame=(%.1f, %.1f, %.1f, %.1f) opacity=%.3f",
               indent, cls, name, f.origin.x, f.origin.y, f.width, f.height, Double(layer.opacity)))

  if layer.cornerRadius != 0 {
    print("\(indent)  cornerRadius=\(fmt(Double(layer.cornerRadius))) curve=\(layer.cornerCurve.rawValue)")
  }
  if let bg = layer.backgroundColor { print("\(indent)  backgroundColor=\(describe(bg as AnyObject))") }
  if let blend = layer.compositingFilter {
    print("\(indent)  compositingFilter:")
    describeFilter(blend as AnyObject, indent: indent + "    ")
  }
  for (label, list) in [("filters", layer.filters), ("backgroundFilters", layer.backgroundFilters)] {
    guard let list, !list.isEmpty else { continue }
    print("\(indent)  \(label): \(list.count)")
    for filter in list { describeFilter(filter as AnyObject, indent: indent + "    ") }
  }

  for key in speculativeLayerKeys {
    guard let value = layer.value(forKey: key) else { continue }
    print("\(indent)  \(key) = \(describe(value as AnyObject))")
  }
  // The private layer classes keep the interesting state in ivars.
  if cls.contains("SDF") || cls.contains("Sdf") || cls.contains("Backdrop") || cls.contains("Glass") {
    dumpIvars(of: layer, indent: indent + "  ivar ")
  }

  for sub in layer.sublayers ?? [] { walk(sub, depth: depth + 1) }
}

// MARK: - CAFilter catalogue

private func isGlassAdjacent(_ type: String) -> Bool {
  let l = type.lowercased()
  return l.contains("glass") || l.contains("vibran") || l.contains("blur")
      || l.contains("sdf") || l.contains("aberr") || l.contains("matrix")
}

private func dumpFilterTypes() {
  guard let cls = NSClassFromString("CAFilter") else { print("CAFilter unavailable"); return }
  let sel = NSSelectorFromString("filterTypes")
  guard (cls as AnyObject).responds(to: sel),
        let types = (cls as AnyObject).perform(sel)?.takeUnretainedValue() as? [String]
  else { print("+[CAFilter filterTypes] unavailable"); return }

  print("── CAFilter types (\(types.count)) ──")
  print("  " + types.sorted().joined(separator: "\n  "))

  print("\n── glass-adjacent filter types, instantiated with their defaults ──")
  let make = NSSelectorFromString("filterWithType:")
  for t in types.sorted() where isGlassAdjacent(t) {
    guard let filter = (cls as AnyObject).perform(make, with: t)?.takeUnretainedValue()
    else { continue }
    describeFilter(filter, indent: "  ")
  }
}

// MARK: - App

@main
final class Probe: NSObject, NSApplicationDelegate {
  static func main() {
    let app = NSApplication.shared
    let probe = Probe()
    app.delegate = probe
    app.setActivationPolicy(.accessory)  // no dock icon, does not steal focus
    app.run()
  }

  private var window: NSWindow?
  private var glass: NSGlassEffectView?

  func applicationDidFinishLaunching(_: Notification) {
    dumpFilterTypes()

    // Off-screen so the probe can run without covering anything.
    let window = NSWindow(contentRect: NSRect(x: -4000, y: -4000, width: 400, height: 300),
                          styleMask: [.borderless], backing: .buffered, defer: false)
    window.isReleasedWhenClosed = false
    self.window = window

    let root = NSView(frame: NSRect(x: 0, y: 0, width: 400, height: 300))
    root.wantsLayer = true
    root.layer?.backgroundColor = NSColor.systemBlue.cgColor

    let label = NSTextField(labelWithString: "glass")
    label.frame = NSRect(x: 20, y: 20, width: 120, height: 24)

    let glass = NSGlassEffectView(frame: NSRect(x: 60, y: 60, width: 240, height: 120))
    glass.contentView = label
    glass.cornerRadius = 28
    glass.style = .regular
    self.glass = glass

    root.addSubview(glass)
    window.contentView = root
    window.orderFrontRegardless()

    root.layoutSubtreeIfNeeded()
    window.displayIfNeeded()
    CATransaction.flush()

    // AppKit builds the glass sublayers lazily across the first commits, so read the
    // tree a couple of runloop turns later rather than straight after display.
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.dumpRegular() }
  }

  private func dumpRegular() {
    print("\n── NSGlassEffectView layer tree (style .regular, cornerRadius 28) ──")
    if let layer = glass?.layer { walk(layer, depth: 0) }

    glass?.style = .clear
    glass?.layoutSubtreeIfNeeded()
    CATransaction.flush()
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
      print("\n── same view, style .clear ──")
      if let layer = self.glass?.layer { walk(layer, depth: 0) }
      NSApp.terminate(nil)
    }
  }
}
