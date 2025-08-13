
import { Review } from '../types';

export const compressImage = (file: File, maxWidth: number = 1920, quality: number = 0.8): Promise<File> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            if (!event.target?.result) {
                return reject(new Error("FileReader did not return a result."));
            }
            img.src = event.target.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxWidth) {
                        width = Math.round((width * maxWidth) / height);
                        height = maxWidth;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    return reject(new Error('Could not get canvas context'));
                }
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                           return reject(new Error('Canvas to Blob conversion failed'));
                        }
                        const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
                        const newFile = new File([blob], newFileName, {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(newFile);
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
};


export const averageRating = (reviews: Review[]): number => {
    if (reviews.length === 0) return 0;
    const total = reviews.reduce((sum, review) => sum + review.rating, 0);
    return Math.round((total / reviews.length) * 10) / 10;
};

// A simple utility to remove accents and special characters for filenames
export const slugify = (text: string) => {
    if (!text) return '';
    return text
        .toLowerCase()
        .normalize("NFD") // separate accent from letter
        .replace(/[\u0300-\u036f]/g, "") // remove all accents
        .replace(/\s+/g, '-') // replace spaces with -
        .replace(/[^\w-]+/g, ''); // remove all non-word chars except hyphen
};

export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km
    return distance;
};

/**
 * Extracts neighborhood from a standard address string.
 * Assumes format "Street, Number - Neighborhood, City - State"
 * @param address The full address string.
 * @returns The neighborhood name or null if not found.
 */
export const extractNeighborhood = (address: string): string | null => {
  // Regex to find text between a hyphen and a comma, trimming whitespace.
  // It handles cases with or without spaces around the hyphen.
  const match = address.match(/-\s*([^,]+)/);
  if (match && match[1]) {
    // Further clean up in case of extra spaces or unwanted characters.
    return match[1].trim();
  }
  return null;
};
