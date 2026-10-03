import ExpoModulesCore
import MapKit

// The driving route between two points from Apple Maps: its line (as
// coordinates), the expected drive time in seconds and the distance in
// metres. Free, no key.
public class DirectionsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Directions")

    AsyncFunction("drivingRoute") { (fromLat: Double, fromLng: Double, toLat: Double, toLng: Double, promise: Promise) in
      let request = MKDirections.Request()
      request.source = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: fromLat, longitude: fromLng)))
      request.destination = MKMapItem(placemark: MKPlacemark(coordinate: CLLocationCoordinate2D(latitude: toLat, longitude: toLng)))
      request.transportType = .automobile
      MKDirections(request: request).calculate { response, error in
        guard let route = response?.routes.first else {
          promise.reject("NO_ROUTE", error?.localizedDescription ?? "No route found.")
          return
        }
        let count = route.polyline.pointCount
        var coords = [CLLocationCoordinate2D](repeating: kCLLocationCoordinate2DInvalid, count: count)
        route.polyline.getCoordinates(&coords, range: NSRange(location: 0, length: count))
        // Turn-by-turn steps: the instruction, its length, and where it ends
        // (the point to announce the next one at).
        let steps: [[String: Any]] = route.steps.compactMap { step in
          let n = step.polyline.pointCount
          guard n > 0 else { return nil }
          var points = [CLLocationCoordinate2D](repeating: kCLLocationCoordinate2DInvalid, count: n)
          step.polyline.getCoordinates(&points, range: NSRange(location: 0, length: n))
          let end = points[n - 1]
          return [
            "instructions": step.instructions,
            "meters": step.distance,
            "end": ["latitude": end.latitude, "longitude": end.longitude],
          ]
        }
        promise.resolve([
          "seconds": route.expectedTravelTime,
          "meters": route.distance,
          "coordinates": coords.map { ["latitude": $0.latitude, "longitude": $0.longitude] },
          "steps": steps,
        ])
      }
    }
  }
}
