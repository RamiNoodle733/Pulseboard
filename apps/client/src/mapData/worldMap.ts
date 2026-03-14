/**
 * Simplified world map data for canvas rendering.
 * Uses Natural Earth-style simplified continent outlines as lat/lon polygon arrays.
 * Mercator projection maps these to canvas coordinates.
 */

// Mercator projection: lat/lon -> normalized [0,1] x [0,1]
export function projectMercator(
  lat: number,
  lon: number,
): { nx: number; ny: number } {
  // nx: 0 (lon -180) to 1 (lon +180)
  const nx = (lon + 180) / 360;
  // ny: Mercator y, clamped to ~85 degrees
  const latRad = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  const mercY = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  // Map mercY from [-π, π] to [1, 0] (top = north)
  const ny = 0.5 - mercY / (2 * Math.PI);
  return { nx, ny };
}

// Convert lat/lon to canvas pixel coordinates with padding
export function geoToCanvas(
  lat: number,
  lon: number,
  width: number,
  height: number,
  padding: number = 0.05,
): { x: number; y: number } {
  const { nx, ny } = projectMercator(lat, lon);
  const usableW = width * (1 - 2 * padding);
  const usableH = height * (1 - 2 * padding);
  return {
    x: padding * width + nx * usableW,
    y: padding * height + ny * usableH,
  };
}

// Simplified continent outlines as arrays of [lon, lat] coordinate pairs.
// Each continent is an array of polygon rings (outer boundary).
// These are heavily simplified (~50 points per continent) for rendering performance.

type Polygon = Array<[number, number]>; // [lon, lat]

export const CONTINENTS: Array<{ name: string; polygons: Polygon[] }> = [
  {
    name: 'North America',
    polygons: [
      [
        [-130, 55], [-125, 60], [-120, 60], [-110, 65], [-95, 70], [-85, 70],
        [-75, 65], [-60, 50], [-55, 47], [-65, 44], [-70, 41], [-75, 35],
        [-80, 32], [-82, 25], [-88, 18], [-90, 20], [-95, 18], [-100, 20],
        [-105, 22], [-110, 25], [-115, 30], [-120, 35], [-125, 40], [-125, 48],
        [-130, 55],
      ],
    ],
  },
  {
    name: 'South America',
    polygons: [
      [
        [-80, 10], [-75, 12], [-70, 12], [-60, 5], [-50, 0], [-45, -3],
        [-35, -5], [-35, -10], [-37, -15], [-40, -22], [-45, -25], [-50, -30],
        [-55, -35], [-60, -40], [-65, -45], [-70, -50], [-75, -52], [-75, -45],
        [-70, -40], [-70, -35], [-72, -30], [-70, -18], [-75, -15], [-78, -5],
        [-77, 0], [-80, 5], [-80, 10],
      ],
    ],
  },
  {
    name: 'Europe',
    polygons: [
      [
        [-10, 36], [-5, 36], [0, 38], [5, 43], [3, 47], [-2, 47], [-5, 48],
        [-10, 44], [-9, 39], [-10, 36],
      ],
      [
        [5, 43], [10, 44], [15, 47], [20, 45], [25, 42], [28, 41], [30, 42],
        [30, 45], [28, 48], [25, 50], [20, 52], [15, 54], [10, 54], [12, 57],
        [15, 60], [10, 62], [5, 62], [5, 58], [8, 56], [5, 55], [0, 51],
        [-5, 50], [-2, 47], [3, 47], [5, 43],
      ],
    ],
  },
  {
    name: 'Africa',
    polygons: [
      [
        [-15, 28], [-5, 36], [0, 37], [10, 37], [12, 33], [15, 32],
        [25, 32], [30, 30], [33, 28], [35, 30], [40, 25], [42, 18],
        [50, 12], [48, 8], [42, 2], [40, -2], [42, -10], [40, -16],
        [37, -22], [32, -28], [28, -33], [22, -34], [18, -35],
        [16, -30], [15, -25], [12, -18], [13, -12], [10, -5],
        [5, 5], [0, 6], [-5, 5], [-8, 5], [-15, 10], [-17, 15],
        [-16, 20], [-17, 24], [-15, 28],
      ],
    ],
  },
  {
    name: 'Asia',
    polygons: [
      [
        [30, 42], [35, 40], [40, 38], [45, 35], [50, 30], [55, 25],
        [60, 25], [65, 20], [70, 20], [75, 15], [80, 10], [80, 15],
        [85, 20], [90, 22], [95, 20], [100, 15], [105, 10], [110, 20],
        [115, 22], [120, 25], [125, 30], [130, 35], [135, 35], [140, 40],
        [145, 45], [140, 50], [135, 55], [130, 50], [120, 53], [115, 50],
        [110, 45], [100, 50], [90, 48], [80, 50], [70, 55], [60, 55],
        [55, 55], [50, 52], [45, 48], [40, 45], [35, 42], [30, 42],
      ],
      // Russia extension
      [
        [40, 55], [50, 55], [60, 60], [70, 60], [80, 55], [90, 55],
        [100, 55], [110, 55], [120, 60], [130, 60], [140, 55], [150, 58],
        [160, 60], [170, 65], [180, 66], [180, 70], [170, 70], [160, 70],
        [150, 68], [140, 65], [130, 65], [120, 68], [110, 65], [100, 65],
        [90, 65], [80, 65], [70, 65], [60, 65], [50, 60], [40, 58], [40, 55],
      ],
    ],
  },
  {
    name: 'Oceania',
    polygons: [
      // Australia
      [
        [115, -15], [120, -14], [130, -12], [136, -12], [140, -15],
        [145, -15], [150, -20], [153, -25], [152, -30], [150, -34],
        [145, -38], [140, -38], [135, -35], [130, -33], [125, -35],
        [120, -34], [115, -33], [114, -26], [114, -22], [115, -15],
      ],
    ],
  },
];

// Pre-build Path2D objects for efficient rendering
let cachedPaths: Path2D[] | null = null;
let cachedWidth = 0;
let cachedHeight = 0;

export function getWorldPaths(width: number, height: number, padding: number = 0.05): Path2D[] {
  if (cachedPaths && cachedWidth === width && cachedHeight === height) {
    return cachedPaths;
  }

  const paths: Path2D[] = [];
  for (const continent of CONTINENTS) {
    for (const polygon of continent.polygons) {
      const path = new Path2D();
      for (let i = 0; i < polygon.length; i++) {
        const [lon, lat] = polygon[i];
        const { x, y } = geoToCanvas(lat, lon, width, height, padding);
        if (i === 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      path.closePath();
      paths.push(path);
    }
  }

  cachedPaths = paths;
  cachedWidth = width;
  cachedHeight = height;
  return paths;
}
