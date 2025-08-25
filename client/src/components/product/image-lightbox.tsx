import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ImageLightboxProps {
  images: string[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onGoToIndex?: (index: number) => void;
}

export default function ImageLightbox({ 
  images, 
  currentIndex, 
  isOpen, 
  onClose, 
  onPrevious, 
  onNext, 
  onGoToIndex 
}: ImageLightboxProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const lightboxContent = (
    <div 
      className="fixed inset-0 z-[100] bg-black bg-opacity-90 flex items-center justify-center"
      onClick={onClose}
      data-testid="lightbox-overlay"
    >
      <div 
        className="relative w-full h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-white hover:text-gray-300 bg-black bg-opacity-50 rounded-full p-3 z-[112] transition-all duration-200 hover:bg-opacity-70"
          data-testid="button-close-lightbox"
        >
          <X size={28} />
        </button>
        
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPrevious();
              }}
              className="absolute left-4 text-white hover:text-gray-300 z-[111] transition-all duration-200 bg-black bg-opacity-30 rounded-full p-2 hover:bg-opacity-50"
              data-testid="button-previous-lightbox"
            >
              <ChevronLeft size={32} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onNext();
              }}
              className="absolute right-4 text-white hover:text-gray-300 z-[111] transition-all duration-200 bg-black bg-opacity-30 rounded-full p-2 hover:bg-opacity-50"
              data-testid="button-next-lightbox"
            >
              <ChevronRight size={32} />
            </button>
          </>
        )}
        
        <img
          src={images[currentIndex]}
          alt={`Product image ${currentIndex + 1}`}
          className="max-w-[90vw] max-h-[90vh] object-contain"
          onClick={(e) => e.stopPropagation()}
          data-testid="lightbox-image"
        />
        
        {images.length > 1 && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2 z-[111]">
            {images.map((_, index) => (
              <button
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onGoToIndex) {
                    onGoToIndex(index);
                  }
                }}
                className={`w-3 h-3 rounded-full cursor-pointer transition-all ${
                  index === currentIndex ? 'bg-white scale-125' : 'bg-white bg-opacity-50 hover:bg-opacity-75'
                }`}
                aria-label={`Go to image ${index + 1}`}
                data-testid={`dot-${index}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(lightboxContent, document.body);
}