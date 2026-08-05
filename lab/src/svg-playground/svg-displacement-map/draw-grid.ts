const WIDTH_ABOUT = 512;
const HEIGHT_ABOUT = 512;

const GRID_SPACING = 40;
const GRID_LINE_WIDTH = 2;
const GRID_LINE_COLOR = '#555555';

interface GridImage {
  width: number;
  height: number;
  imageUrl: string;
}

export const drawGridImage = (): GridImage | null => {
  const canvas = document.createElement('canvas');

  const gridSpacing = GRID_SPACING;
  const gridLineWidth = GRID_LINE_WIDTH;
  const horizontalGridLines = Math.ceil((WIDTH_ABOUT - gridSpacing) / (gridSpacing + gridLineWidth));
  const verticalGridLines = Math.ceil((HEIGHT_ABOUT - gridSpacing) / (gridSpacing + gridLineWidth));
  const height = horizontalGridLines * (gridSpacing + gridLineWidth) + gridSpacing;
  const width = verticalGridLines * (gridSpacing + gridLineWidth) + gridSpacing;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    console.error('Failed to get canvas context');
    return null;
  }

  // fill with white color
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, width, height);

  // draw horizontal lines
  for (let y = gridSpacing; y < height; y += gridSpacing + gridLineWidth) {
    ctx.fillStyle = GRID_LINE_COLOR;
    ctx.fillRect(0, y, width, gridLineWidth);
  }

  // draw vertical lines
  for (let x = gridSpacing; x < width; x += gridSpacing + gridLineWidth) {
    ctx.fillStyle = GRID_LINE_COLOR;
    ctx.fillRect(x, 0, gridLineWidth, height);
  }

  const imageUrl = canvas.toDataURL('image/png');

  return {
    width,
    height,
    imageUrl,
  };
};
