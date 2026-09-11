const THEMES = new Set(['blue', 'green', 'peach', 'lavender', 'mono']);
const CELL_COUNT = 35;
const IMAGE_FITS = new Set(['cover', 'contain']);
const IMAGE_POSITIONS = new Set(['center', 'top', 'bottom']);

function shortText(value, maxLength) {
  return typeof value === 'string' && value.trim().length <= maxLength ? value.trim() : null;
}

function backgroundImage(value) {
  if (value === '' || value === undefined) return '';
  if (typeof value !== 'string' || value.length > 250_000) return null;
  return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : null;
}

export function classTimetableData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const title = shortText(value.title, 40);
  const theme = THEMES.has(value.theme) ? value.theme : null;
  const image = backgroundImage(value.backgroundImage);
  const opacity = Number(value.backgroundOpacity);
  const cellOpacity = Number(value.cellOpacity);
  const colors = value.colors && typeof value.colors === 'object' ? value.colors : {};
  const normalizedColors = Object.fromEntries(['paper', 'head', 'grid', 'ink'].map((key) => [key, typeof colors[key] === 'string' && /^#[0-9A-Fa-f]{6}$/.test(colors[key]) ? colors[key].toUpperCase() : null]));
  const imageFit = IMAGE_FITS.has(value.imageFit) ? value.imageFit : null;
  const imagePosition = IMAGE_POSITIONS.has(value.imagePosition) ? value.imagePosition : null;
  if (!title || !theme || image === null || !Number.isFinite(opacity) || opacity < 0 || opacity > 1 || !Number.isFinite(cellOpacity) || cellOpacity < 0 || cellOpacity > 1 || Object.values(normalizedColors).some((color) => !color) || !imageFit || !imagePosition || !Array.isArray(value.cells) || value.cells.length !== CELL_COUNT) return null;
  const cells = value.cells.map((cell) => ({
    subject: shortText(cell?.subject ?? '', 30),
    teacher: shortText(cell?.teacher ?? '', 30),
  }));
  if (cells.some((cell) => cell.subject === null || cell.teacher === null)) return null;
  return { title, theme, backgroundImage: image, backgroundOpacity: opacity, cellOpacity, colors: normalizedColors, imageFit, imagePosition, cells };
}

export const CLASS_TIMETABLE_THEMES = [...THEMES];
export const CLASS_TIMETABLE_CELL_COUNT = CELL_COUNT;
