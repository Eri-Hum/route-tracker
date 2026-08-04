import { useEffect, useRef, useCallback } from 'react';
import { useMap } from 'react-leaflet';
import { pathDistance } from '../utils/haversine';

// Freehand drawing overlay for "Draw Route" mode. A canvas sits on top of the
// Leaflet map and captures pointer movement while the mouse/finger is held
// down, mirroring the map-panning gestures being temporarily disabled.
export default function DrawCanvas({ active, onRouteComplete }) {
  const map = useMap();
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const pixelPointsRef = useRef([]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = map.getSize();
    canvas.width = size.x;
    canvas.height = size.y;
  }, [map]);

  useEffect(() => {
    resizeCanvas();
    map.on('resize', resizeCanvas);
    return () => map.off('resize', resizeCanvas);
  }, [map, resizeCanvas]);

  useEffect(() => {
    const interactions = [
      map.dragging,
      map.scrollWheelZoom,
      map.doubleClickZoom,
      map.touchZoom,
      map.boxZoom,
      map.keyboard,
    ];
    if (active) {
      interactions.forEach((h) => h && h.disable());
      resizeCanvas();
    } else {
      interactions.forEach((h) => h && h.enable());
    }
  }, [active, map, resizeCanvas]);

  const getCtx = () => canvasRef.current.getContext('2d');

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    getCtx().clearRect(0, 0, canvas.width, canvas.height);
  };

  const getPoint = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches && e.touches[0];
    const clientX = touch ? touch.clientX : e.clientX;
    const clientY = touch ? touch.clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handleStart = (e) => {
    if (!active) return;
    e.preventDefault();
    drawingRef.current = true;
    pixelPointsRef.current = [];
    clearCanvas();
    const p = getPoint(e);
    pixelPointsRef.current.push(p);
    const ctx = getCtx();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.strokeStyle = '#e6402b';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const handleMove = (e) => {
    if (!active || !drawingRef.current) return;
    e.preventDefault();
    const p = getPoint(e);
    pixelPointsRef.current.push(p);
    const ctx = getCtx();
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const handleEnd = (e) => {
    if (!active || !drawingRef.current) return;
    e.preventDefault();
    drawingRef.current = false;

    const pixelPoints = pixelPointsRef.current;
    if (pixelPoints.length < 2) {
      clearCanvas();
      return;
    }

    const latlngs = pixelPoints.map(({ x, y }) => {
      const { lat, lng } = map.containerPointToLatLng([x, y]);
      return [lat, lng];
    });

    const distanceKm = pathDistance(latlngs);
    onRouteComplete(latlngs, distanceKm);
    clearCanvas();
  };

  return (
    <canvas
      ref={canvasRef}
      className={`draw-canvas ${active ? 'draw-canvas--active' : ''}`}
      onMouseDown={handleStart}
      onMouseMove={handleMove}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={handleStart}
      onTouchMove={handleMove}
      onTouchEnd={handleEnd}
    />
  );
}
