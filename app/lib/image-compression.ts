/**
 * =============================================================================
 * BAVINI CLOUD - Image Compression Utilities
 * =============================================================================
 * Provides image compression utilities using Web Workers for large images
 * and main thread for small images.
 *
 * @module lib/image-compression
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ImageCompression');

// Image compression settings
export const MAX_IMAGE_DIMENSION = 1920; // Max width/height in pixels
export const COMPRESSION_QUALITY = 0.8; // 0-1, only for JPEG/WebP

// Threshold for using worker (500KB) - below this, main thread is faster
export const WORKER_COMPRESSION_THRESHOLD = 500 * 1024;

// Worker idle timeout - terminate after 30s of inactivity to free resources
const WORKER_IDLE_TIMEOUT_MS = 30_000;

// Worker singleton for image compression with idle timeout
let compressionWorker: Worker | null = null;
let workerIdCounter = 0;
let workerIdleTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Terminate the compression worker and cleanup resources.
 * Call this on component unmount or when cleaning up.
 */
export const terminateCompressionWorker = (): void => {
  if (workerIdleTimeout) {
    clearTimeout(workerIdleTimeout);
    workerIdleTimeout = null;
  }

  if (compressionWorker) {
    compressionWorker.terminate();
    compressionWorker = null;
    logger.debug('Compression worker terminated');
  }
};

/**
 * Schedule worker termination after idle timeout.
 * Resets the timer on each call.
 */
const scheduleWorkerTermination = (): void => {
  // Clear existing timeout
  if (workerIdleTimeout) {
    clearTimeout(workerIdleTimeout);
  }

  // Schedule new termination
  workerIdleTimeout = setTimeout(() => {
    if (compressionWorker) {
      compressionWorker.terminate();
      compressionWorker = null;
      workerIdleTimeout = null;
      logger.debug('Compression worker terminated due to inactivity');
    }
  }, WORKER_IDLE_TIMEOUT_MS);
};

/**
 * Gets or creates the image compression worker.
 * OPTIMIZED: Schedules automatic termination after idle timeout.
 */
export const getCompressionWorker = (): Worker => {
  // Reset idle timeout on each access
  scheduleWorkerTermination();

  if (!compressionWorker) {
    compressionWorker = new Worker(new URL('../workers/image-compression.worker.ts', import.meta.url), {
      type: 'module',
    });
    logger.debug('Compression worker created');
  }

  return compressionWorker;
};

/**
 * Compress a large image via Web Worker (>500KB)
 * Avoids blocking the main thread for large images
 */
export const compressImageWithWorker = async (file: File): Promise<File> => {
  try {
    // Create an ImageBitmap for transfer to worker
    const imageBitmap = await createImageBitmap(file);

    return new Promise((resolve) => {
      const worker = getCompressionWorker();
      const requestId = `compress-${++workerIdCounter}`;

      const handleMessage = (event: MessageEvent) => {
        const response = event.data;

        if (response.id !== requestId) {
          return;
        }

        worker.removeEventListener('message', handleMessage);

        if (response.type === 'success' && response.result) {
          const { blob, wasCompressed, mimeType } = response.result;

          if (wasCompressed) {
            const compressedFile = new File([blob], file.name, {
              type: mimeType,
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        } else {
          // On error, return the original file
          logger.warn('Worker compression failed:', response.error);
          resolve(file);
        }
      };

      worker.addEventListener('message', handleMessage);

      // Send the image to the worker (transfer the ImageBitmap)
      worker.postMessage(
        {
          id: requestId,
          type: 'compress',
          payload: {
            imageData: imageBitmap,
            fileName: file.name,
            mimeType: file.type,
            originalSize: file.size,
          },
        },
        [imageBitmap], // Transfer the ImageBitmap (no copy)
      );
    });
  } catch (error) {
    logger.warn('Failed to use worker for compression:', error);
    return file;
  }
};

/**
 * Compress an image on the main thread (for small images <500KB)
 * Faster than worker for small images (no worker overhead)
 */
export const compressImageMainThread = async (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions while maintaining aspect ratio
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        if (width > height) {
          height = Math.round((height * MAX_IMAGE_DIMENSION) / width);
          width = MAX_IMAGE_DIMENSION;
        } else {
          width = Math.round((width * MAX_IMAGE_DIMENSION) / height);
          height = MAX_IMAGE_DIMENSION;
        }
      }

      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(file); // Fallback to original
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob with compression
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const quality = outputType === 'image/png' ? undefined : COMPRESSION_QUALITY;

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          // Only use compressed version if it's smaller
          if (blob.size < file.size) {
            const compressedFile = new File([blob], file.name, {
              type: outputType,
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        },
        outputType,
        quality,
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Compresses an image file.
 * - Returns original file for GIFs (to preserve animation)
 * - Uses Web Worker for large images (>500KB) to avoid blocking UI
 * - Uses main thread for small images (faster, no worker overhead)
 */
export const compressImage = async (file: File): Promise<File> => {
  // Don't compress GIFs (would break animation)
  if (file.type === 'image/gif') {
    return file;
  }

  // Use worker for large images, main thread for small ones
  if (file.size > WORKER_COMPRESSION_THRESHOLD) {
    return compressImageWithWorker(file);
  }

  return compressImageMainThread(file);
};

/**
 * Converts a file to a base64 data URL
 */
export const fileToDataURL = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};
