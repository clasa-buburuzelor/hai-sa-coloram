const PALETTE_COLORS = [
  "#ffffff", "#ff3b30", "#ff9500", "#ffd60a", "#a8e05f", "#34c759",
  "#00c7be", "#4cc9f0", "#007aff", "#5856d6", "#af52de", "#ff2d92",
  "#ff9ecb", "#8b5a2b", "#c8a27a", "#8e8e93", "#3a3a3c",
];

const MAX_CANVAS_WIDTH = 1100;
const LINE_BRIGHTNESS_LIMIT = 170; // darker pixels are treated as outline
const STORAGE_PREFIX = "coloring:";

const canvas = document.querySelector("#canvas");
const paletteEl = document.querySelector("#palette");

let ctx;
let width;
let height;
let isOutline; // 1 = outline pixel, 0 = free pixel
let currentColor = PALETTE_COLORS[1];
let currentFile; // picture that is open in the paint view

// Saved progress (kept in the browser, per picture)
function loadSaved(file) {
  try {
    return localStorage.getItem(STORAGE_PREFIX + file);
  } catch {
    return null; // storage can be blocked, the app still works without it
  }
}

function savePainting() {
  try {
    localStorage.setItem(STORAGE_PREFIX + currentFile, canvas.toDataURL("image/png"));
  } catch {
    // storage full or blocked: ignore
  }
}

function deleteSaved(file) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + file);
  } catch {
    // nothing to do
  }
}

// Teacher shortcut: open the site with #reset-all at the end of the address
function resetAllPaintings() {
  if (confirm("Ștergi TOATE desenele colorate de pe acest calculator?")) {
    const savedKeys = Object.keys(localStorage)
      .filter(key => key.startsWith(STORAGE_PREFIX));

    savedKeys.forEach(key => localStorage.removeItem(key));
    buildHome();
  }
  location.hash = "";
}

// Home page
function buildCard(picture) {
  const saved = loadSaved(picture.file);
  const title = picture.title || ""; // pictures without a title show no text

  const colorLayer = saved
    ? `<img class="thumb-color" src="${saved}" alt="">`
    : "";
  const badge = saved
    ? `<span class="badge">⭐ Colorat!</span>`
    : "";

  return `
    <a class="card ${saved ? "done" : ""}" href="#p=${encodeURIComponent(picture.file)}">
      ${badge}
      <div class="thumb">
        ${colorLayer}
        <img class="thumb-outline" src="${picture.file}" alt="${title}">
      </div>
      ${title}
    </a>`;
}

function buildHome() {
  const gallery = document.querySelector("#gallery");
  gallery.innerHTML = SECTIONS.map(section => `
    <h2 id="sec-${section.id}">${section.emoji ?? ""} ${section.title}</h2>
    <div class="grid">${section.pictures.map(buildCard).join("")}</div>`
  ).join("");
}

// Routing (the URL hash decides which view is shown)
function findPicture(file) {
  return SECTIONS
    .flatMap(section => section.pictures)
    .find(picture => picture.file === file);
}

function route() {
  if (location.hash === "#reset-all") {
    resetAllPaintings();
    return;
  }

  const match = location.hash.match(/^#p=(.+)/);
  const picture = match && findPicture(decodeURIComponent(match[1]));
  const wasPainting = !document.querySelector("#paint").hidden;

  document.querySelector("#home").hidden = Boolean(picture);
  document.querySelector("#paint").hidden = !picture;

  if (picture) {
    openPicture(picture);
  } else if (wasPainting) {
    buildHome(); // show the newly colored picture
  }
}

window.addEventListener("hashchange", route);

// Palette
function selectColor(color) {
  currentColor = color;
  document.querySelector("#current-color").style.background = color;

  paletteEl.querySelectorAll(".swatch").forEach(swatch => {
    swatch.classList.toggle("selected", swatch.dataset.color === color);
  });
}

function addSwatch(color) {
  const swatch = document.createElement("button");
  swatch.className = "swatch";
  swatch.style.background = color;
  swatch.dataset.color = color;
  swatch.setAttribute("aria-label", "Culoare " + color);
  swatch.addEventListener("click", () => selectColor(color));
  paletteEl.appendChild(swatch);
}

document.querySelector("#color-picker").addEventListener("change", event => {
  const color = event.target.value;

  // Do not add the same color twice
  if (!paletteEl.querySelector(`[data-color="${color}"]`)) {
    addSwatch(color);
  }
  selectColor(color);
});

// Painting
function clearCanvas() {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
}

function brightness(r, g, b) {
  return 0.3 * r + 0.59 * g + 0.11 * b;
}

function openPicture(picture) {
  currentFile = picture.file;
  document.querySelector("#picture-title").textContent = picture.title || "";
  document.querySelector("#outline").src = picture.file;

  const source = new Image();
  source.onload = () => setupCanvas(source);
  source.src = picture.file;
}

function setupCanvas(source) {
  const naturalWidth = source.naturalWidth || 1000;
  const naturalHeight = source.naturalHeight || 1000;
  const scale = Math.min(1, MAX_CANVAS_WIDTH / naturalWidth);

  width = Math.round(naturalWidth * scale);
  height = Math.round(naturalHeight * scale);
  canvas.width = width;
  canvas.height = height;
  document.querySelector("#canvas-wrap").style.setProperty("--ratio", width / height);

  ctx = canvas.getContext("2d", { willReadFrequently: true });

  // Draw the picture once on a white background to find where the outlines are
  clearCanvas();
  ctx.drawImage(source, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;

  isOutline = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    isOutline[i] = brightness(r, g, b) < LINE_BRIGHTNESS_LIMIT ? 1 : 0;
  }

  // The canvas only keeps the colors; the outline is an <img> drawn on top
  clearCanvas();
  restoreSavedPainting();
}

function restoreSavedPainting() {
  const saved = loadSaved(currentFile);
  if (!saved) {
    return;
  }

  const image = new Image();
  image.onload = () => ctx.drawImage(image, 0, 0, width, height);
  image.src = saved;
}

// If the child taps right on a line, look for a free pixel close to it
function findFreePixelNear(x, y, radius = 4) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      const inside = nx >= 0 && ny >= 0 && nx < width && ny < height;

      if (inside && !isOutline[ny * width + nx]) {
        return ny * width + nx;
      }
    }
  }
  return -1;
}

function floodFill(x, y) {
  let start = y * width + x;

  if (isOutline[start]) {
    start = findFreePixelNear(x, y);
    if (start < 0) {
      return;
    }
  }

  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const value = parseInt(currentColor.slice(1), 16);
  const red = value >> 16;
  const green = (value >> 8) & 255;
  const blue = value & 255;

  const visited = new Uint8Array(width * height);
  const stack = [start];

  while (stack.length > 0) {
    const i = stack.pop();

    if (visited[i] || isOutline[i]) {
      continue;
    }
    visited[i] = 1;

    data[i * 4] = red;
    data[i * 4 + 1] = green;
    data[i * 4 + 2] = blue;
    data[i * 4 + 3] = 255;

    const column = i % width;
    if (column > 0) stack.push(i - 1);
    if (column < width - 1) stack.push(i + 1);
    if (i >= width) stack.push(i - width);
    if (i < width * (height - 1)) stack.push(i + width);
  }

  ctx.putImageData(image, 0, 0);
  savePainting();
}

canvas.addEventListener("pointerdown", event => {
  const box = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - box.left) * width / box.width);
  const y = Math.floor((event.clientY - box.top) * height / box.height);
  floodFill(x, y);
});

// Buttons
document.querySelector("#back-btn").addEventListener("click", () => {
  location.hash = "";
});

document.querySelector("#reset-btn").addEventListener("click", () => {
  if (confirm("Vrei să ștergi toate culorile și să începi de la capăt?")) {
    clearCanvas();
    deleteSaved(currentFile);
  }
});

// start
PALETTE_COLORS.forEach(addSwatch);
buildHome();
selectColor(currentColor);
route();
