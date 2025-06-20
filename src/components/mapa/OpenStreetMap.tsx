'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Props = {
  onChange?: (coords: { lat: string; lng: string }) => void;
};

export default function OpenStreetMap({ onChange }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapRef.current || mapRef.current.childNodes.length > 0) return;

    const map = L.map(mapRef.current).setView([-34.9011, -56.1645], 13); // Montevideo

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    let marker: L.Marker;

    map.on('click', function (e) {
      const { lat, lng } = e.latlng;

      if (onChange) {
        onChange({ lat: lat.toFixed(6), lng: lng.toFixed(6) });
      }

      if (marker) {
        marker.setLatLng(e.latlng);
      } else {
        marker = L.marker(e.latlng).addTo(map);
      }
    });
  }, [onChange]);

  return <div ref={mapRef} className="w-full h-[300px] rounded-md shadow-md z-0" />;
}
