import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { haversineDistance } from '../utils/haversine';

// Builds cumulative-distance vs elevation data points for the chart.
function toChartData(points, elevations) {
  let cumulativeKm = 0;
  return points.map((point, i) => {
    if (i > 0) cumulativeKm += haversineDistance(points[i - 1], point);
    return {
      km: Number(cumulativeKm.toFixed(2)),
      elevation: Math.round(elevations[i] ?? 0),
    };
  });
}

export default function ElevationChart({ route }) {
  if (!route) return null;
  const data = toChartData(route.points, route.elevations);

  return (
    <div className="elevation-chart">
      <h3>Elevation profile</h3>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <defs>
            <linearGradient id="elevationFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2b7de6" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#2b7de6" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#3a3f4b" />
          <XAxis
            dataKey="km"
            tickFormatter={(v) => `${v}km`}
            stroke="#9aa5b1"
            fontSize={12}
          />
          <YAxis
            stroke="#9aa5b1"
            fontSize={12}
            tickFormatter={(v) => `${v}m`}
            width={48}
          />
          <Tooltip
            formatter={(value) => [`${value} m`, 'Elevation']}
            labelFormatter={(label) => `${label} km`}
            contentStyle={{ background: '#1f232b', border: '1px solid #3a3f4b' }}
          />
          <Area type="monotone" dataKey="elevation" stroke="#2b7de6" fill="url(#elevationFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
