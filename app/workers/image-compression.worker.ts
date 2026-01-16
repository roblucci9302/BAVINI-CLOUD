/**
 * Web Worker pour la compression d'images
 * Décharge le main thread pour les images volumineuses (>500KB)
 * Utilise OffscreenCanvas pour le traitement
 */

// Configuration de compression
const MAX_IMAGE_DIMENSION = 1920;
const COMPRESSION_QUALITY = 0.8;

// Types pour la communication
export interface ImageCompressionRequest {
  id: string;
  type: 'compress';
  payload: {
    imageData: ImageBitmap;
    fileName: string;
    mimeType: string;
    originalSize: number;
  };
}

export interface ImageCompressionResponse {
  id: string;
  type: 'success' | 'error';
  result?: {
    blob: Blob;
    fileName: string;
    mimeType: string;
    originalSize: number;
    compressedSize: number;
    wasCompressed: boolean;
  };
  error?: string;
}

/**
 * Compresse une image en utilisant OffscreenCanvas
 */
async function compressImage(
  imageData: ImageBitmap,
  fileName: string,
  mimeType: string,
  originalSize: number,
): Promise<ImageCompressionResponse['result']> {
  let { width, height } = imageData;

  // Calculer les nouvelles dimensions en gardant le ratio
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    if (width > height) {
      height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
      width = MAX_IMAGE_DIMENSION;
    } else {
      width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
      height = MAX_IMAGE_DIMENSION;
    }
  }

  // Créer un OffscreenCanvas pour le traitement
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Impossible de créer le contexte 2D');
  }

  // Dessiner l'image redimensionnée
  ctx.drawImage(imageData, 0, 0, width, height);

  // Convertir en blob avec compression
  const outputType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg';
  const quality = outputType === 'image/png' ? undefined : COMPRESSION_QUALITY;

  const blob = await canvas.convertToBlob({
    type: outputType,
    quality,
  });

  // Retourner le résultat
  return {
    blob,
    fileName,
    mimeType: outputType,
    originalSize,
    compressedSize: blob.size,
    wasCompressed: blob.size < originalSize,
  };
}

/**
 * Envoyer une réponse
 */
function sendResponse(response: ImageCompressionResponse): void {
  self.postMessage(response);
}

/**
 * Gestionnaire de messages
 */
self.onmessage = async (event: MessageEvent<ImageCompressionRequest>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'compress': {
        const result = await compressImage(payload.imageData, payload.fileName, payload.mimeType, payload.originalSize);
        sendResponse({ id, type: 'success', result });
        break;
      }

      default:
        sendResponse({ id, type: 'error', error: `Unknown message type: ${type}` });
    }
  } catch (error) {
    sendResponse({
      id,
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Informer que le worker est prêt
self.postMessage({ type: 'ready' });
