import { useMemo } from 'react'

const PALETTE = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#06b6d4']

function cornerColor(index: number): string {
  return PALETTE[index % PALETTE.length]
}

/** Haversine distance between two lat/lng points in meters */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Format distance: <1m show cm, else show m with 1 decimal */
function fmtDist(m: number): string {
  if (m < 1) return `${(m * 100).toFixed(0)}cm`
  if (m < 1000) return `${m.toFixed(1)}m`
  return `${(m / 1000).toFixed(2)}km`
}

interface FloorPlanProps {
  polygon: number[][] // [[lat, lng], ...]
  name?: string
  bufferMeters?: number
  width?: number
  height?: number
}

export default function FloorPlan({ polygon, name, bufferMeters, width = 600, height = 500 }: FloorPlanProps) {
  const padding = 80

  const layout = useMemo(() => {
    if (polygon.length === 0) return null

    // Compute distances between consecutive points (and closing edge)
    const distances: number[] = []
    for (let i = 0; i < polygon.length; i++) {
      const next = (i + 1) % polygon.length
      distances.push(haversineDistance(polygon[i][0], polygon[i][1], polygon[next][0], polygon[next][1]))
    }

    // Total perimeter
    const totalPerimeter = distances.reduce((a, b) => a + b, 0)

    // Convert lat/lng to local x/y (meters from min corner)
    const centerLat = polygon.reduce((s, p) => s + p[0], 0) / polygon.length
    const metersPerDegreeLat = 111320
    const metersPerDegreeLng = 111320 * Math.cos((centerLat * Math.PI) / 180)

    const xyPoints = polygon.map(([lat, lng]) => ({
      x: lng * metersPerDegreeLng,
      y: lat * metersPerDegreeLat,
    }))

    const minX = Math.min(...xyPoints.map(p => p.x))
    const maxX = Math.max(...xyPoints.map(p => p.x))
    const minY = Math.min(...xyPoints.map(p => p.y))
    const maxY = Math.max(...xyPoints.map(p => p.y))

    const rangeX = maxX - minX || 1
    const rangeY = maxY - minY || 1

    const drawW = width - padding * 2
    const drawH = height - padding * 2
    const scale = Math.min(drawW / rangeX, drawH / rangeY)

    // Center the drawing
    const scaledW = rangeX * scale
    const scaledH = rangeY * scale
    const offsetX = padding + (drawW - scaledW) / 2
    const offsetY = padding + (drawH - scaledH) / 2

    // Convert to SVG coords (flip Y since SVG y goes down)
    const svgPoints = xyPoints.map(p => ({
      x: offsetX + (p.x - minX) * scale,
      y: offsetY + scaledH - (p.y - minY) * scale,
    }))

    return { svgPoints, distances, totalPerimeter }
  }, [polygon, width, height, padding])

  if (!layout || polygon.length === 0) {
    return (
      <div className="flex items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200" style={{ width, height }}>
        <p className="text-gray-400 text-sm">No points to display</p>
      </div>
    )
  }

  const { svgPoints, distances, totalPerimeter } = layout

  // Build polyline path (closed shape)
  const pathPoints = [...svgPoints, svgPoints[0]]
  const pathD = pathPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      {name && (
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="font-semibold text-gray-900">{name}</h3>
          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
            <span>{polygon.length} points</span>
            <span>Perimeter: {fmtDist(totalPerimeter)}</span>
            {bufferMeters && <span>Buffer: {bufferMeters}m</span>}
          </div>
        </div>
      )}

      {/* SVG Canvas */}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block bg-white">
        {/* Grid pattern */}
        <defs>
          <pattern id="floorplan-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f3f4f6" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#floorplan-grid)" />

        {/* Filled area (very light) */}
        <path d={pathD} fill="#e0f2fe" fillOpacity="0.4" stroke="none" />

        {/* Dashed polygon outline */}
        <path
          d={pathD}
          fill="none"
          stroke="#374151"
          strokeWidth="2"
          strokeDasharray="8 4"
          strokeLinejoin="round"
        />

        {/* Edge lines with distance labels */}
        {svgPoints.map((p, i) => {
          const next = svgPoints[(i + 1) % svgPoints.length]
          const midX = (p.x + next.x) / 2
          const midY = (p.y + next.y) / 2
          const dist = distances[i]

          // Compute angle for label offset (perpendicular to edge)
          const dx = next.x - p.x
          const dy = next.y - p.y
          const len = Math.sqrt(dx * dx + dy * dy)
          // Normal direction (perpendicular)
          const nx = len > 0 ? -dy / len : 0
          const ny = len > 0 ? dx / len : 0
          const labelOffset = 16

          return (
            <g key={`edge-${i}`}>
              {/* Distance label on edge */}
              <rect
                x={midX + nx * labelOffset - 28}
                y={midY + ny * labelOffset - 8}
                width="56"
                height="16"
                rx="4"
                fill="white"
                stroke="#d1d5db"
                strokeWidth="0.5"
              />
              <text
                x={midX + nx * labelOffset}
                y={midY + ny * labelOffset + 4}
                textAnchor="middle"
                className="text-[10px] fill-gray-600 font-medium"
                style={{ fontSize: '10px' }}
              >
                {fmtDist(dist)}
              </text>
            </g>
          )
        })}

        {/* Point markers and labels */}
        {svgPoints.map((p, i) => {
          const color = cornerColor(i)
          const lat = polygon[i][0]
          const lng = polygon[i][1]

          return (
            <g key={`point-${i}`}>
              {/* Outer ring */}
              <circle cx={p.x} cy={p.y} r="14" fill="white" stroke={color} strokeWidth="2" />
              {/* Inner filled circle */}
              <circle cx={p.x} cy={p.y} r="10" fill={color} />
              {/* Number */}
              <text
                x={p.x}
                y={p.y + 4}
                textAnchor="middle"
                fill="white"
                fontWeight="bold"
                style={{ fontSize: '11px' }}
              >
                {i + 1}
              </text>

              {/* Coordinate label */}
              <rect
                x={p.x + 16}
                y={p.y - 20}
                width="108"
                height="30"
                rx="4"
                fill="white"
                stroke={color}
                strokeWidth="1"
                opacity="0.95"
              />
              <text
                x={p.x + 22}
                y={p.y - 7}
                className="fill-gray-700 font-medium"
                style={{ fontSize: '9px' }}
              >
                {lat.toFixed(6)}, {lng.toFixed(6)}
              </text>
              <text
                x={p.x + 22}
                y={p.y + 4}
                className="fill-gray-400"
                style={{ fontSize: '8px' }}
              >
                Point {i + 1}{i === 0 ? ' (Start)' : ''}
                {i > 0 ? ` · ${fmtDist(distances[i - 1])} from P${i}` : ''}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Point table below */}
      <div className="border-t border-gray-100 px-4 py-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 text-left">
              <th className="py-1 pr-2 font-medium">#</th>
              <th className="py-1 pr-2 font-medium">Latitude</th>
              <th className="py-1 pr-2 font-medium">Longitude</th>
              <th className="py-1 pr-2 font-medium">Dist from prev</th>
            </tr>
          </thead>
          <tbody>
            {polygon.map((pt, i) => (
              <tr key={i} className="border-t border-gray-50">
                <td className="py-1.5 pr-2">
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold"
                    style={{ backgroundColor: cornerColor(i) }}
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="py-1.5 pr-2 font-mono text-gray-700">{pt[0].toFixed(6)}</td>
                <td className="py-1.5 pr-2 font-mono text-gray-700">{pt[1].toFixed(6)}</td>
                <td className="py-1.5 pr-2 text-gray-600">
                  {i === 0 ? '—' : fmtDist(distances[i - 1])}
                </td>
              </tr>
            ))}
            {polygon.length >= 3 && (
              <tr className="border-t border-gray-200 font-medium text-gray-700">
                <td className="py-1.5 pr-2" colSpan={3}>Total perimeter (closing back to start)</td>
                <td className="py-1.5 pr-2">{fmtDist(totalPerimeter)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
