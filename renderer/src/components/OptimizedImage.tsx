import { useEffect, useState } from "react";

// Image component with progressive loading
interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  placeholder?: string;
  alt: string;
  className?: string;
}

const OptimizedImage = ({
  src,
  placeholder = "/placeholder.svg",
  alt,
  className = "",
  ...props
}: OptimizedImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Placeholder image */}
      {!isLoaded && !hasError && (
        <img
          src={placeholder}
          alt=""
          className="absolute inset-0 w-full h-full object-cover blur-sm"
          style={{ filter: "blur(8px)" }}
        />
      )}

      {/* Main image with progressive loading */}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          setHasError(true);
          setIsLoaded(true);
        }}
        loading="lazy"
        decoding="async"
        {...props}
      />

      {/* Fallback if image fails to load */}
      {hasError && (
        <div className="absolute inset-0 w-full h-full bg-gray-100 flex items-center justify-center">
          <span className="text-gray-500 text-sm">Image not available</span>
        </div>
      )}
    </div>
  );
};

export default OptimizedImage;