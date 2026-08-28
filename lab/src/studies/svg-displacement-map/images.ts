import landscapeImageUrl from './assets/landscape.webp';
import rainbowImageUrl from './assets/rainbow.webp';
import { drawGridImage } from './draw-grid.js';

export const getImages = () => {
  const gridImageUrl = drawGridImage();
  return [
    { name: 'rainbow', url: rainbowImageUrl },
    { name: 'landscape', url: landscapeImageUrl },
    { name: 'grid', url: gridImageUrl?.imageUrl ?? null },
  ] as const;
};

export type Image = ReturnType<typeof getImages>[number];
export type ImageName = Image['name'];

export interface ImageState {
  allImages: readonly Image[];
  currentImage: Image;
  currentImageName: ImageName;
  currentImageUrl: string | null;
  currentImageIndex: number;
  nextImageName: ImageName;
}

export function imageReducer(state: ImageState, action: 'next' | 'previous'): ImageState {
  switch (action) {
    case 'next': {
      const currentIndex = state.allImages.indexOf(state.currentImage);
      const nextIndex = (currentIndex + 1) % state.allImages.length;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const nextImage = state.allImages[nextIndex]!;
      const nextNextIndex = (nextIndex + 1) % state.allImages.length;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const nextNextImage = state.allImages[nextNextIndex]!;

      return {
        ...state,
        currentImage: nextImage,
        currentImageName: nextImage.name,
        currentImageUrl: nextImage.url,
        currentImageIndex: nextIndex,
        nextImageName: nextNextImage.name,
      };
    }
    case 'previous': {
      const currentImage = state.currentImage;
      const currentIndex = state.allImages.indexOf(state.currentImage);
      const previousIndex = (currentIndex - 1 + state.allImages.length) % state.allImages.length;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const previousImage = state.allImages[previousIndex]!;

      return {
        ...state,
        currentImage: previousImage,
        currentImageName: previousImage.name,
        currentImageUrl: previousImage.url,
        currentImageIndex: previousIndex,
        nextImageName: currentImage.name,
      };
    }
    default: {
      action satisfies never;
      return state;
    }
  }
}
