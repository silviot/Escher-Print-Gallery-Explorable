/** App-independent gallery data. Insets are fractions of the source dimensions. */
export interface GalleryItem {
  id: string;
  title: string;
  description: string;
  src: string;
  thumbnail: string;
  originalSrc?: string;
  alt: string;
  category: string;
  nest: { x: number; y: number; w: number; h: number };
  shape: 'ellipse' | 'rect';
}

export type GalleryVariant = 'cinema' | 'passage' | 'cabinet';

export interface GalleryProps {
  items: GalleryItem[];
  initialId?: string;
  onselect?: (item: GalleryItem) => void;
}
