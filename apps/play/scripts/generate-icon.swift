import AppKit
let image = NSImage(size: NSSize(width: 180, height: 180))
image.lockFocus()
NSColor(calibratedWhite: 0.09, alpha: 1).setFill()
NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: 180, height: 180), xRadius: 39.6, yRadius: 39.6).fill()
let t = NSAffineTransform(); t.translateX(by: 0, yBy: 180); t.scaleX(by: 1.8, yBy: -1.8); t.concat()
NSColor(calibratedWhite: 0.96, alpha: 1).setStroke()
func line(_ points: [(CGFloat, CGFloat)], close: Bool = false) {
 let p = NSBezierPath(); p.lineWidth = 3.5; p.lineJoinStyle = .round
 p.move(to: NSPoint(x: points[0].0, y: points[0].1))
 for point in points.dropFirst() { p.line(to: NSPoint(x: point.0, y: point.1)) }
 if close { p.close() }; p.stroke()
}
line([(50,16),(79,32.75),(79,66.25),(50,83),(21,66.25),(21,32.75)], close: true)
line([(21,32.75),(50,49.5),(79,32.75)])
line([(50,49.5),(50,83)])
line([(50,27.2),(59.7,32.8),(50,38.4),(40.3,32.8)], close: true)
line([(30.7,49.5),(40.3,55.1),(40.3,66.2),(30.7,60.7)], close: true)
line([(69.3,49.5),(59.7,55.1),(59.7,66.2),(69.3,60.7)], close: true)
image.unlockFocus()
let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
