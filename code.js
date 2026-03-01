figma.showUI(__html__, { width: 400, height: 300 });

figma.ui.onmessage = async (msg) => {
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
  const { replaceFills = true, replaceStrokes = true } = options;

  let result = svg;

  if (replaceFills) {
    // Replace fill="<color>" but not fill="none"
    result = result.replace(/fill="(?!none)([^"]+)"/gi, 'fill="currentColor"');
    // Replace fill in style attributes
    result = result.replace(/fill:\s*(?!none)[^;")]+/gi, 'fill:currentColor');
  }

  if (replaceStrokes) {
    result = result.replace(/stroke="(?!none)([^"]+)"/gi, 'stroke="currentColor"');
    result = result.replace(/stroke:\s*(?!none)[^;")]+/gi, 'stroke:currentColor');
  }

  return result;
}