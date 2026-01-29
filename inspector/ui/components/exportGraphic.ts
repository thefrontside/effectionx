// Top-level helpers (kept at module scope for easier testing and reuse)
function serializeSvgElement(el: SVGElement) {
  let cssText = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from((sheet as CSSStyleSheet).cssRules || [])) {
        cssText += `${(rule as CSSRule).cssText}\n`;
      }
    } catch (e) {
      // ignore cross-origin stylesheets
    }
  }

  const serializer = new XMLSerializer();
  let svgString = serializer.serializeToString(el as SVGElement);

  const indexOfSvgTagEnd = svgString.indexOf(">");
  const styleTag = `<style type="text/css"><![CDATA[\n${cssText}\n]]></style>`;
  svgString =
    svgString.slice(0, indexOfSvgTagEnd + 1) +
    styleTag +
    svgString.slice(indexOfSvgTagEnd + 1);

  if (!svgString.match(/^<svg[^>]+xmlns="http:\/\/www.w3.org\/2000\/svg"/)) {
    svgString = svgString.replace(
      "<svg",
      '<svg xmlns="http://www.w3.org/2000/svg"',
    );
  }
  if (
    !svgString.match(/^<svg[^>]+xmlns:xlink="http:\/\/www.w3.org\/1999\/xlink"/)
  ) {
    svgString = svgString.replace(
      "<svg",
      '<svg xmlns:xlink="http://www.w3.org/1999/xlink"',
    );
  }

  const rect = (el as SVGElement).getBoundingClientRect();
  const width = Math.ceil(rect.width) || 800;
  const height = Math.ceil(rect.height) || 600;

  if (!/\swidth=/i.test(svgString) && !/\sheight=/i.test(svgString)) {
    svgString = svgString.replace(
      "<svg",
      `<svg width="${width}" height="${height}"`,
    );
  } else {
    svgString = svgString
      .replace(/\swidth="[^"]*"/i, ` width="${width}"`)
      .replace(/\sheight="[^"]*"/i, ` height="${height}"`);
  }

  if (!svgString.startsWith("<?xml")) {
    svgString = `<?xml version="1.0" standalone="no"?>\n${svgString}`;
  }
  if (!/viewBox=/.test(svgString)) {
    svgString = svgString.replace(
      "<svg",
      `<svg viewBox="0 0 ${width} ${height}"`,
    );
  }

  return { svgString, width, height };
}

export function exportSvgElement(
  el: SVGElement,
  fileNamePrefix = "effectionx-graph",
) {
  const { svgString } = serializeSvgElement(el);
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const fileName = `${fileNamePrefix}-${Date.now()}.svg`;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { success: true, fileName };
}

export async function exportSvgElementToPng(
  svgElement: SVGElement,
  fileNamePrefix = "effectionx-graph",
) {
  if (!svgElement) throw new Error("No SVG element provided");

  // Try image routes (data url / blob), then canvg fallback
  async function tryImageRoute(svgStr: string) {
    const img = new Image();
    // try base64
    let imgSrc = "";
    try {
      const svgBase64 = btoa(unescape(encodeURIComponent(svgStr)));
      imgSrc = `data:image/svg+xml;base64,${svgBase64}`;
    } catch (e) {
      imgSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
    }

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Image load failed (data URL)"));
      img.src = imgSrc;
    });

    ctx?.setTransform(scale, 0, 0, scale, 0, 0);
    ctx?.drawImage(img, 0, 0);
  }

  async function tryBlobRoute(svgStr: string) {
    const img = new Image();

    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const blobUrl = URL.createObjectURL(blob);
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Image load failed (blob URL)"));
        img.src = blobUrl;
      });

      ctx?.setTransform(scale, 0, 0, scale, 0, 0);
      ctx?.drawImage(img, 0, 0);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }

  async function tryCanvg(svgStr: string) {
    // dynamic import so it isn't bundled unless needed
    const module = await import("canvg");
    // v4 API: Canvg.from(ctx, svgStr)
    const Canvg = (module as any).Canvg;
    if (!Canvg) throw new Error("canvg not available");
    const v = await Canvg.from(ctx, svgStr);
    await v.render();
  }

  // Serialize first — also get width/height for canvas size
  const { svgString, width, height } = serializeSvgElement(svgElement);

  // Create canvas sized to the computed dimensions and device pixel ratio
  const canvas = document.createElement("canvas");
  const scale = window.devicePixelRatio || 1;
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Could not acquire canvas context");

  let lastErr: Error | undefined;
  try {
    await tryImageRoute(svgString);
  } catch (e) {
    lastErr = e as Error;
    try {
      await tryBlobRoute(svgString);
    } catch (e2) {
      lastErr = e2 as Error;
      try {
        await tryCanvg(svgString);
      } catch (e3) {
        lastErr = e3 as Error;
        // attach debug svg to the thrown error for upstream handling
        const err = new Error("All export routes failed");
        (err as any).debugSvg = svgString;
        (err as any).inner = lastErr;
        throw err;
      }
    }
  }

  // export canvas to blob and download
  return await new Promise<{ success: boolean; fileName: string }>(
    (resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Failed to create PNG blob"));
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const fileName = `${fileNamePrefix}-${Date.now()}.png`;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        resolve({ success: true, fileName });
      }, "image/png");
    },
  );
}
