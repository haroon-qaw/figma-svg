figma.showUI(__html__, { width: 400, height: 360 });

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
      const converted = convertToCurrentColor(svg, msg.options);
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