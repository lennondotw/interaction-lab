// A single-file SwiftUI app for looking at the two corner curves side by side.
// No Xcode project, no simulator, no bundle — one file and one compile.
//
//   xcrun swiftc -parse-as-library demo.swift -o demo && ./demo
//   ./demo --png __screenshots__/shapes.png     # headless, no window
//
// `-parse-as-library` is what allows `@main` to live in a single file; without it
// the compiler treats the file as top-level script code and rejects the attribute.
//
// The numbers this is illustrating are in probe.swift, which measures rather than
// draws. This exists because "the apex stays put while the curve reaches further
// along the edge" is a sentence, and the overlay is the picture of it.

import AppKit
import SwiftUI

private let arcColor = Color(red: 0.05, green: 0.45, blue: 0.95)
private let contColor = Color(red: 0.95, green: 0.42, blue: 0.05)

/// The two curves at the same nominal radius, drawn on top of each other.
private struct Overlay: View {
  let side: CGFloat
  let radius: CGFloat
  var showExtents = false

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: radius, style: .circular)
        .stroke(arcColor, lineWidth: 2)
      RoundedRectangle(cornerRadius: radius, style: .continuous)
        .stroke(contColor, lineWidth: 2)

      if showExtents {
        // Where each curve rejoins the straight edge, along the top.
        ZStack(alignment: .topLeading) {
          Color.clear
          tick(at: radius, color: arcColor)
          tick(at: radius * 1.52, color: contColor)
        }
      }
    }
    .frame(width: side, height: side)
  }

  private func tick(at x: CGFloat, color: Color) -> some View {
    Rectangle()
      .fill(color)
      .frame(width: 1, height: 14)
      .offset(x: min(x, side), y: -7)
  }
}

private struct Labelled<Content: View>: View {
  let title: String
  let subtitle: String?
  @ViewBuilder var content: Content

  var body: some View {
    VStack(spacing: 8) {
      content
      VStack(spacing: 2) {
        Text(title).font(.system(size: 11, weight: .medium, design: .monospaced))
        if let subtitle {
          Text(subtitle).font(.system(size: 10, design: .monospaced))
            .foregroundStyle(.secondary)
        }
      }
    }
  }
}

struct DemoView: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 28) {
      header

      section("1. Same radius, two curves") {
        HStack(spacing: 36) {
          ForEach([24.0, 48, 72], id: \.self) { r in
            Labelled(title: "r = \(Int(r))", subtitle: "ticks: r and 1.52r") {
              Overlay(side: 180, radius: r, showExtents: true)
            }
          }
        }
        Text(
          "The two curves meet at the corner apex — the depth is the same — and part company along the edge. Continuous reaches ~1.52r before it is straight again."
        )
        .modifier(Caption())
      }

      section("2. As the radius approaches the clamp") {
        HStack(spacing: 36) {
          ForEach([0.3, 0.6, 0.8, 1.0], id: \.self) { frac in
            Labelled(
              title: "r = \(Int(frac * 100))% of side/2",
              subtitle: frac >= 0.66 ? "no edge budget left" : nil
            ) {
              Overlay(side: 150, radius: frac * 75)
            }
          }
        }
        Text(
          "Past ~66% the continuous curve has no edge left to spread into and collapses onto the arc. At 100% the orange is hidden under the blue: both are a circle."
        )
        .modifier(Caption())
      }

      section("3. Circle, Capsule, and a rounded rect with a huge radius") {
        HStack(spacing: 36) {
          ForEach(
            [
              ("Circle()", AnyShape(Circle())),
              ("Capsule(.continuous)", AnyShape(Capsule(style: .continuous))),
              ("RoundedRect(1e4)", AnyShape(RoundedRectangle(cornerRadius: 10000))),
            ], id: \.0
          ) { name, shape in
            Labelled(title: name, subtitle: "dashed = the 240x120 frame") {
              ZStack {
                Rectangle()
                  .strokeBorder(
                    .secondary,
                    style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                shape.stroke(arcColor, lineWidth: 2)
              }
              .frame(width: 240, height: 120)
            }
          }
        }
        Text(
          "Circle() insets to the largest circle that fits and leaves the frame unfilled; the other two fill it. They are different shapes, not two spellings of one."
        )
        .modifier(Caption())
      }
    }
    .padding(32)
    .background(Color(nsColor: .textBackgroundColor))
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("SwiftUI corner curves").font(.system(size: 17, weight: .semibold))
      HStack(spacing: 14) {
        swatch(arcColor, ".circular")
        swatch(contColor, ".continuous")
      }
    }
  }

  private func swatch(_ color: Color, _ label: String) -> some View {
    HStack(spacing: 5) {
      RoundedRectangle(cornerRadius: 2).fill(color).frame(width: 18, height: 3)
      Text(label).font(.system(size: 11, design: .monospaced))
    }
  }

  private func section<C: View>(_ title: String, @ViewBuilder _ content: () -> C) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(title).font(.system(size: 13, weight: .medium))
      content()
    }
  }
}

private struct Caption: ViewModifier {
  func body(content: Content) -> some View {
    content
      .font(.system(size: 11))
      .foregroundStyle(.secondary)
      .frame(maxWidth: 820, alignment: .leading)
      .fixedSize(horizontal: false, vertical: true)
  }
}

@main
struct DemoApp: App {
  init() {
    guard let index = CommandLine.arguments.firstIndex(of: "--png") else { return }
    let path =
      CommandLine.arguments.count > index + 1 ? CommandLine.arguments[index + 1] : "shapes.png"
    render(to: path)
    exit(0)
  }

  var body: some Scene {
    WindowGroup("SwiftUI corner curves") { DemoView() }
      .windowResizability(.contentSize)
  }
}

/// Renders the view to a 2x PNG without ever opening a window.
@MainActor
private func render(to path: String) {
  let renderer = ImageRenderer(content: DemoView())
  renderer.scale = 2
  guard
    let image = renderer.nsImage,
    let tiff = image.tiffRepresentation,
    let rep = NSBitmapImageRep(data: tiff),
    let png = rep.representation(using: .png, properties: [:])
  else {
    FileHandle.standardError.write(Data("failed to render\n".utf8))
    exit(1)
  }
  do {
    try png.write(to: URL(fileURLWithPath: path))
    print("wrote \(path)")
  } catch {
    FileHandle.standardError.write(Data("write failed: \(error)\n".utf8))
    exit(1)
  }
}
