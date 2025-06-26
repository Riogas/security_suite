import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Button } from '@/components/ui/button';
import { Crosshair, Plus } from 'lucide-react';
import axios from 'axios';

type MapaModalProps = {
  isManualLocationActive: boolean;
  setIsManualLocationActive: (active: boolean) => void;
  setIsModalOpen: (open: boolean) => void;
  modalMapRef: React.RefObject<HTMLDivElement | null>;
  mapInstanceRef: React.RefObject<L.Map | null>;
  markerRef: React.RefObject<L.Marker | null>;
  onConfirm: (data: {
    lat: number;
    lng: number;
    address: string;
    houseNumber: string;
  }) => void;
};

// Componente principal del modal que contiene el mapa
export default function MapaModal({
  isManualLocationActive,
  setIsManualLocationActive,
  setIsModalOpen,
  modalMapRef,
  mapInstanceRef,
  markerRef,
  onConfirm,
}: MapaModalProps) {
  const [address, setAddress] = useState(''); // Estado para almacenar la dirección obtenida
  const [loading, setLoading] = useState(false); // Estado para controlar la carga del botón de confirmar

  // Lógica para inicializar el mapa dentro del modal
  useEffect(() => {
    if (modalMapRef.current) {
      if (!mapInstanceRef.current) {
        const map = L.map(modalMapRef.current).setView([-34.9011, -56.1645], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);
        mapInstanceRef.current = map;
      } else {
        mapInstanceRef.current.invalidateSize();
      }
    }
  }, [modalMapRef, mapInstanceRef]);

  const handleReverseGeocoding = async (lat: number, lng: number) => {
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`
      );
      const { address } = response.data;
      const street = address.road || 'Calle desconocida';
      const houseNumber = address.house_number ? `, ${address.house_number}` : '';
      setAddress(`${street}${houseNumber}`);
    } catch (error) {
      console.error('Error en la geolocalización inversa:', error);
      setAddress('No se pudo obtener la dirección');
    }
  };

  const handleConfirm = () => {
    if (markerRef.current) {
      const latLng = markerRef.current.getLatLng();
      const [street, houseNumber] = address.split(',');
      onConfirm({
        lat: latLng.lat,
        lng: latLng.lng,
        address: street.trim(),
        houseNumber: houseNumber?.trim() || ''
      });
    }
    setLoading(false);
    setIsModalOpen(false);
  };

  return (
    <div className="w-[90vw] h-[80vh] flex flex-col bg-gray-800 text-white rounded-md relative">
      {/* Contenedor del mapa dentro del modal */}
      <div
        ref={modalMapRef}
        className="flex-grow w-full pointer-events-auto h-full"
        onClick={(e) => {
          if (isManualLocationActive) {
            const map = mapInstanceRef.current;
            if (map) {
              const latLng = map.mouseEventToLatLng(e.nativeEvent as MouseEvent);
              console.log('Coordenadas:', latLng);
              if (markerRef.current) {
                map.removeLayer(markerRef.current);
              }
              markerRef.current = L.marker([latLng.lat, latLng.lng]).addTo(map);
              handleReverseGeocoding(latLng.lat, latLng.lng); // Llamar a la geolocalización inversa
            }
          }
        }}
      />

      {/* Botón para activar/desactivar ubicación manual */}
      <div className="absolute top-4 right-4 flex flex-col space-y-2 z-400 pointer-events-none">
        <button
          className={`w-10 h-10 rounded-full flex items-center justify-center pointer-events-auto ${
            isManualLocationActive ? 'bg-red-500' : 'bg-gray-700'
          } hover:bg-gray-600`}
          onClick={() => setIsManualLocationActive(!isManualLocationActive)}
          title="Ubicar manual"
        >
          📍
        </button>
      </div>

      {/* Botones de acción dentro del modal y campo de dirección */}
      <div className="flex justify-between items-center space-x-4 mt-4 px-4">
        {/* Campo no editable para mostrar la dirección */}
        <div className="w-1/2">
          <label className="block text-sm font-medium text-gray-300">Dirección:</label>
          <input
            type="text"
            value={address}
            readOnly
            className="w-full bg-gray-700 text-white px-3 py-2 rounded-md border border-gray-600"
          />
        </div>

        {/* Botones de acción */}
        <div className="flex space-x-4">
            <Button
            variant="outline"
            className="flex items-center gap-2"
            onClick={() => setIsModalOpen(false)}
          >
            <span>Volver</span>
          </Button>
          <Button
            className="flex items-center gap-2"
            onClick={handleConfirm}
          >
            <span>Confirmar</span>
            {loading && (
              <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-blue-500"></div>
            )}
          </Button>
          
        </div>
      </div>

      {/* Botones en la esquina inferior derecha */}
      <div className="absolute bottom-20 right-4 flex flex-col items-end space-y-2 z-400 pointer-events-none">
        <Button
          size="icon"
          variant="secondary"
          className="rounded-full shadow-md pointer-events-auto"
          onClick={() => {
            const map = mapInstanceRef.current;
            if (map) {
              map.locate({ setView: true, maxZoom: 16 });
            }
          }}
          title="Centrar en mi ubicación"
        >
          <Crosshair className="w-5 h-5" />
        </Button>

        <Button
          size="icon"
          variant="secondary"
          className="rounded-full shadow-md pointer-events-auto"
          onClick={() => {
            console.log('Agregar punto de interés');
          }}
          title="Agregar punto de interés"
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
