import type { Size } from './svg.ts';

/** Offers data to the user as a file to save. Nothing leaves the browser. */
export function download(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // The download reads the data after the click returns, so the URL has to outlive it for a while.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Draws an SVG document into a PNG image of exactly the given size in pixels.
 * The SVG must ask for that size itself, so that it is drawn sharply instead
 * of being scaled as a bitmap.
 */
export async function rasterize(svgText: string, size: Size): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot draw the image.');
    context.drawImage(image, 0, 0, size.width, size.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('This browser cannot encode the image.'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
