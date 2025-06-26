import React, { useRef, useEffect } from "react";

const GOOGLE_MAPS_API_KEY = "AIzaSyDG4p0fpvU14IQx0lfElZwBqhW6AwwM21g";

declare global {
  interface Window {
    google: any;
  }
}

export default function MapaGoogle() {
  const mapRef = useRef<HTMLDivElement>(null);
  const searchBoxRef = useRef<HTMLInputElement>(null);
  const markerRef = useRef<any>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;

    script.onload = () => {
      const waitForGoogle = () => {
        if (
          window.google &&
          window.google.maps &&
          window.google.maps.places &&
          typeof window.google.maps.Map === "function"
        ) {
          // Google Maps está listo
          if (mapRef.current && searchBoxRef.current) {
            const map = new window.google.maps.Map(mapRef.current, {
              center: { lat: -34.9011, lng: -56.1645 },
              zoom: 13,
            });

            mapInstance.current = map;

            const searchBox = new window.google.maps.places.SearchBox(searchBoxRef.current);
            map.controls[window.google.maps.ControlPosition.TOP_LEFT].push(searchBoxRef.current);

            map.addListener("bounds_changed", () => {
              searchBox.setBounds(map.getBounds());
            });

            searchBox.addListener("places_changed", () => {
              const places = searchBox.getPlaces();
              if (!places || places.length === 0) return;

              const place = places[0];
              if (!place.geometry || !place.geometry.location) return;

              map.panTo(place.geometry.location);
              map.setZoom(16);

              if (markerRef.current) {
                markerRef.current.setMap(null);
              }

              markerRef.current = new window.google.maps.Marker({
                map,
                position: place.geometry.location,
                draggable: true,
              });
            });

            map.addListener("click", (e: any) => {
              if (markerRef.current) {
                markerRef.current.setMap(null);
              }

              markerRef.current = new window.google.maps.Marker({
                map,
                position: e.latLng,
                draggable: true,
              });
            });
          }
        } else {
          // Volver a intentar si aún no está listo
          setTimeout(waitForGoogle, 50);
        }
      };

      waitForGoogle();
    };

    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div style={{ width: "100%" }}>
      {/* Input fuera del mapa */}
      <div style={{ marginBottom: "10px", position: "relative" }}>
        <input
          ref={searchBoxRef}
          type="text"
          placeholder="búsqueda"
          style={{
            width: "100%",
            maxWidth: "400px",
            padding: "8px",
            borderRadius: "4px",
            border: "1px solid #ccc",
            background: "#fff",
            fontSize: "14px",
            color: "#000", // texto negro
            top: "13px", // para que se alinee con el mapa
            position: "relative",
          }}
        />
      </div>

      {/* Mapa */}
      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: "800px",
          borderRadius: "8px",
          minWidth: "1200px",
          background: "#fff",
        }}
      ></div>
    </div>
  );
}
