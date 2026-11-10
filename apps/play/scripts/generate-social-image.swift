// Run on macOS: swift scripts/generate-social-image.swift public/og-menger-cube-minimal.png
import AppKit
let image = NSImage(size: NSSize(width: 1200, height: 630))
image.lockFocus()
NSColor(calibratedWhite: 0.96, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: 1200, height: 630).fill()
let transform = NSAffineTransform()
transform.translateX(by: 451, yBy: 547)
transform.scaleX(by: 2.98, yBy: -2.98)
transform.concat()
NSColor(calibratedWhite: 0.09, alpha: 1).setStroke()
func line(_ points: [(CGFloat, CGFloat)], close: Bool = false) {
    let path = NSBezierPath(); path.lineWidth = 2.2; path.lineJoinStyle = .round
    path.move(to: NSPoint(x: points[0].0, y: points[0].1))
    for p in points.dropFirst() { path.line(to: NSPoint(x: p.0, y: p.1)) }
    if close { path.close() }; path.stroke()
}
line([(50,16),(79,32.75),(79,66.25),(50,83),(21,66.25),(21,32.75)], close: true)
line([(21,32.75),(50,49.5),(79,32.75)])
line([(50,49.5),(50,83)])
line([(50,27.2),(59.7,32.8),(50,38.4),(40.3,32.8)], close: true)
line([(30.7,49.5),(40.3,55.1),(40.3,66.2),(30.7,60.7)], close: true)
line([(69.3,49.5),(59.7,55.1),(59.7,66.2),(69.3,60.7)], close: true)
transform.invert(); transform.concat()
func centered(_ string: String, y: CGFloat, size: CGFloat, color: NSColor, weight: NSFont.Weight) {
 let attrs: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color]
 let s = string as NSString; let width = s.size(withAttributes: attrs).width
 s.draw(at: NSPoint(x: (1200-width)/2, y: y), withAttributes: attrs)
}
centered("Menger Twist Cube", y: 135, size: 38, color: NSColor(calibratedWhite: 0.09, alpha: 1), weight: .medium)
centered("A puzzle in another dimension.", y: 96, size: 18, color: NSColor(calibratedWhite: 0.46, alpha: 1), weight: .regular)
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
let data = bitmap.representation(using: .png, properties: [:])!
try data.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
