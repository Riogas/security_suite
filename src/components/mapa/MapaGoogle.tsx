import React, { useRef, useEffect } from "react";

const GOOGLE_MAPS_API_KEY = "AIzaSyDG4p0fpvU14IQx0lfElZwBqhW6AwwM21g";

declare global {
  interface Window {
    google: any;
  }
}

export default function MapaGoogle({
  onLocationChange,
}: {
  onLocationChange?: (data: {
    address: string;
    houseNumber: string;
    lat: string;
    lng: string;
  }) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const searchBoxRef = useRef<HTMLInputElement>(null);
  const markerRef = useRef<any>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    const waitForGoogle = () => {
      if (
        window.google &&
        window.google.maps &&
        window.google.maps.places &&
        typeof window.google.maps.Map === "function"
      ) {
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

            const components = place.address_components || [];
            const street = components.find((c: any) =>
              c.types.includes("route")
            )?.long_name || "";
            const houseNumber = components.find((c: any) =>
              c.types.includes("street_number")
            )?.long_name || "";

            const address = houseNumber
              ? `${street} ${houseNumber}`
              : place.formatted_address || "Dirección no disponible";

            const lat = place.geometry.location.lat().toString();
            const lng = place.geometry.location.lng().toString();

            console.log(`Dirección: ${address}, Latitud: ${lat}, Longitud: ${lng}`);

            if (onLocationChange) {
              onLocationChange({ address, houseNumber, lat, lng });
            }
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

            const geocoder = new window.google.maps.Geocoder();
            geocoder.geocode({ location: e.latLng }, (results: any, status: string) => {
              if (status === "OK" && results[0]) {
                const components = results[0].address_components || [];
                const street = components.find((c: any) =>
                  c.types.includes("route")
                )?.long_name || "";
                const houseNumber = components.find((c: any) =>
                  c.types.includes("street_number")
                )?.long_name || "";

                const address = houseNumber
                  ? `${street} ${houseNumber}`
                  : results[0].formatted_address || "Dirección no disponible";

                const lat = e.latLng.lat().toString();
                const lng = e.latLng.lng().toString();

                console.log(`Dirección: ${address}, Latitud: ${lat}, Longitud: ${lng}`);

                if (onLocationChange) {
                  onLocationChange({ address, houseNumber, lat, lng });
                }
              } else {
                console.log("No se pudo obtener la dirección");
              }
            });
          });
        }
      } else {
        setTimeout(waitForGoogle, 50);
      }
    };

    // ✅ Carga condicional del script
    if (
      typeof window.google === "undefined" ||
      typeof window.google.maps === "undefined"
    ) {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        console.log("Google Maps API cargada correctamente.");
        waitForGoogle();
      };
      script.onerror = () => {
        console.error("Error al cargar el script de Google Maps API.");
      };
      document.body.appendChild(script);
    } else {
      waitForGoogle();
    }
  }, []);

  return (
    <div style={{ width: "100%" }}>
      {/* Input de búsqueda */}
      <div style={{ marginTop: "13px" }}>
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
            color: "#000",
            top: "10px !important",
          }}
        />
      </div>

      {/* Mapa */}
      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: "600px",
          borderRadius: "8px",
          minWidth: "1200px",
          background: "#fff",
          paddingTop: "13px",
        }}
      ></div>
    </div>
  );
}
