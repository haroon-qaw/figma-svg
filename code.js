figma.showUI(__html__, { width: 424, height: 424 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'resize') return;

  if (msg.type === 'export') {
    const nodes = figma.currentPage.selection;

    if (!nodes.length) {
      figma.ui.postMessage({ type: 'error', message: 'Select at least one layer.' });
      return;
    }

    const results = [];

    for (const node of nodes) {
      const svg = await node.exportAsync({ format: 'SVG_STRING' });
      let converted = convertToCurrentColor(svg, msg.options);
      converted = trimSvgViewBox(converted);
      if (msg.options.responsive) {
        converted = makeSvgResponsive(converted);
      }
      results.push({ name: node.name, svg: converted });
    }

    figma.ui.postMessage({ type: 'result', results });
  }
};

function convertToCurrentColor(svg, options = {}) {
  const { replaceFills = true, replaceStrokes = true, replaceMasks = false } = options;

  const saved = [];
  let result = svg.replace(/<(mask|clipPath)[\s\S]*?<\/\1>/gi, (match) => {
    saved.push(match);
    return `%%PROTECTED_${saved.length - 1}%%`;
  });

  const applyReplacements = (str) => {
    if (replaceFills) {
      str = str.replace(/fill="(?!none)([^"]+)"/gi, 'fill="currentColor"');
      str = str.replace(/fill:\s*(?!none)[^;")]+/gi, 'fill:currentColor');
    }
    if (replaceStrokes) {
      str = str.replace(/stroke="(?!none)([^"]+)"/gi, 'stroke="currentColor"');
      str = str.replace(/stroke:\s*(?!none)[^;")]+/gi, 'stroke:currentColor');
    }
    return str;
  };

  result = applyReplacements(result);

  result = result.replace(/%%PROTECTED_(\d+)%%/g, (_, i) => {
    return replaceMasks ? applyReplacements(saved[i]) : saved[i];
  });

  return result;
}

function makeSvgResponsive(svgString) {
  return svgString.replace(/<svg(\s[^>]*)>/i, (match, attrs) => {
    const cleaned = attrs
      .replace(/\s*width="[^"]*"/i, '')
      .replace(/\s*height="[^"]*"/i, '');
    return '<svg' + cleaned + '>';
  });
}

// Get bounding box from SVG path d attribute (handles M, L, H, V, C, Q, Z)
function getPathBbox(d) {
  if (!d || typeof d !== 'string') return null;
  const tokens = d.match(/[-+]?(?:\d*\.?\d+(?:[eE][-+]?\d+)?)|[MmLlHhVvCcQqSsTtAaZz]/g);
  if (!tokens || !tokens.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let x = 0, y = 0, x0 = 0, y0 = 0;
  let i = 0;
  let v;
  const num = () => (i < tokens.length && /^-?[\d.eE+]/.test(tokens[i])) ? parseFloat(tokens[i++]) : null;
  const add = (px, py) => {
    if (px !== undefined && py !== undefined) {
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py);
    }
  };
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (!cmd || cmd.length > 1) continue;
    switch (cmd) {
      case 'M': x = num(); y = num(); x0 = x; y0 = y; add(x, y); while ((v = num()) !== null) { x = v; y = num(); add(x, y); } break;
      case 'm': x += num(); y += num(); x0 = x; y0 = y; add(x, y); while ((v = num()) !== null) { x += v; y += num(); add(x, y); } break;
      case 'L': while ((v = num()) !== null) { x = v; y = num(); add(x, y); } break;
      case 'l': while ((v = num()) !== null) { x += v; y += num(); add(x, y); } break;
      case 'H': while ((v = num()) !== null) { x = v; add(x, y); } break;
      case 'h': while ((v = num()) !== null) { x += v; add(x, y); } break;
      case 'V': while ((v = num()) !== null) { y = v; add(x, y); } break;
      case 'v': while ((v = num()) !== null) { y += v; add(x, y); } break;
      case 'C': while ((v = num()) !== null) { const x1 = v, y1 = num(), x2 = num(), y2 = num(); x = num(); y = num(); add(x1, y1); add(x2, y2); add(x, y); } break;
      case 'c': while ((v = num()) !== null) { const x1 = x + v, y1 = y + num(), x2 = x + num(), y2 = y + num(); x += num(); y += num(); add(x1, y1); add(x2, y2); add(x, y); } break;
      case 'Q': while ((v = num()) !== null) { const qx = v, qy = num(); x = num(); y = num(); add(qx, qy); add(x, y); } break;
      case 'q': while ((v = num()) !== null) { const qx = x + v, qy = y + num(); x += num(); y += num(); add(qx, qy); add(x, y); } break;
      case 'S': while ((v = num()) !== null) { x = num(); y = num(); add(x, y); } break;
      case 's': while ((v = num()) !== null) { x += num(); y += num(); add(x, y); } break;
      case 'T': while ((v = num()) !== null) { x = v; y = num(); add(x, y); } break;
      case 't': while ((v = num()) !== null) { x += v; y += num(); add(x, y); } break;
      case 'Z': case 'z': x = x0; y = y0; break;
      case 'A': case 'a': { const rx = Math.abs(num()), ry = Math.abs(num()); num(); num(); num(); const nx = num(), ny = num(); x = (cmd === 'a') ? x + nx : nx; y = (cmd === 'a') ? y + ny : ny; add(x - rx, y - ry); add(x + rx, y + ry); } break;
      default: break;
    }
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

function getRectBbox(attrs) {
  const x = parseFloat(attrs.x) || 0, y = parseFloat(attrs.y) || 0;
  const w = parseFloat(attrs.width) || 0, h = parseFloat(attrs.height) || 0;
  return { minX: x, minY: y, maxX: x + w, maxY: y + h };
}

function getCircleBbox(attrs) {
  const cx = parseFloat(attrs.cx) || 0, cy = parseFloat(attrs.cy) || 0, r = parseFloat(attrs.r) || 0;
  return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
}

function getEllipseBbox(attrs) {
  const cx = parseFloat(attrs.cx) || 0, cy = parseFloat(attrs.cy) || 0, rx = parseFloat(attrs.rx) || 0, ry = parseFloat(attrs.ry) || 0;
  return { minX: cx - rx, minY: cy - ry, maxX: cx + rx, maxY: cy + ry };
}

function getLineBbox(attrs) {
  const x1 = parseFloat(attrs.x1) || 0, y1 = parseFloat(attrs.y1) || 0, x2 = parseFloat(attrs.x2) || 0, y2 = parseFloat(attrs.y2) || 0;
  return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) };
}

function getPointsBbox(pointsStr) {
  const nums = (pointsStr || '').match(/-?[\d.]+/g);
  if (!nums || nums.length < 2) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    const x = parseFloat(nums[i]), y = parseFloat(nums[i + 1]);
    if (!isNaN(x) && !isNaN(y)) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

function parseAttrs(str) {
  const o = {};
  (str || '').replace(/\s*(\w+)\s*=\s*["']([^"']*)["']/g, (_, k, v) => { o[k.toLowerCase()] = v; });
  return o;
}

function trimSvgViewBox(svgString) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const extend = (b) => {
    if (!b) return;
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  };

  svgString.replace(/<path\s[^>]*\bd\s*=\s*["']([^"']*)["'][^>]*>/gi, (_, d) => { extend(getPathBbox(d)); });
  svgString.replace(/<rect\s([^>]*)>/gi, (_, attrs) => { extend(getRectBbox(parseAttrs(attrs))); });
  svgString.replace(/<circle\s([^>]*)>/gi, (_, attrs) => { extend(getCircleBbox(parseAttrs(attrs))); });
  svgString.replace(/<ellipse\s([^>]*)>/gi, (_, attrs) => { extend(getEllipseBbox(parseAttrs(attrs))); });
  svgString.replace(/<line\s([^>]*)>/gi, (_, attrs) => { extend(getLineBbox(parseAttrs(attrs))); });
  svgString.replace(/<polyline\s[^>]*\bpoints\s*=\s*["']([^"']*)["'][^>]*>/gi, (_, p) => { extend(getPointsBbox(p)); });
  svgString.replace(/<polygon\s[^>]*\bpoints\s*=\s*["']([^"']*)["'][^>]*>/gi, (_, p) => { extend(getPointsBbox(p)); });
  svgString.replace(/<text\s[^>]*\bx\s*=\s*["']([^"']*)["'][^>]*\by\s*=\s*["']([^"']*)["'][^>]*>/gi, (_, x, y) => { extend({ minX: parseFloat(x) || 0, minY: parseFloat(y) || 0, maxX: parseFloat(x) || 0, maxY: parseFloat(y) || 0 }); });

  if (minX === Infinity) return svgString;

  const pad = 0.5;
  let vbW = maxX - minX + 2 * pad, vbH = maxY - minY + 2 * pad;
  if (vbW <= 0 || vbH <= 0) return svgString;
  const vbMinX = minX - pad, vbMinY = minY - pad;
  const newViewBox = `${vbMinX} ${vbMinY} ${vbW} ${vbH}`;

  return svgString.replace(/<svg(\s[^>]*)>/i, (match, attrs) => {
    const hasViewBox = /\bviewBox\s*=/i.test(attrs);
    const newAttrs = hasViewBox
      ? attrs.replace(/\bviewBox\s*=\s*["'][^"']*["']/i, `viewBox="${newViewBox}"`)
      : attrs + ` viewBox="${newViewBox}"`;
    return '<svg' + newAttrs + '>';
  });
}