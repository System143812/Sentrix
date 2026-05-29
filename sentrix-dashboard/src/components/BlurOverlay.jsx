import React from "react";
import { createPortal } from "react-dom";

/**
 * A centralized and reusable fixed blur overlay component.
 * Uses React Portals to ensure it always covers the full viewport,
 * bypassing parent transforms or stacking context restrictions.
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children - Content to be displayed on top of the overlay.
 * @param {boolean} [props.isOpen=true] - Whether the overlay is visible.
 * @param {Function} [props.onClose] - Optional callback when the backdrop is clicked.
 * @param {string} [props.className] - Additional classes for the backdrop.
 * @param {string} [props.containerClassName] - Additional classes for the content container.
 */
export function BlurOverlay({ 
  children, 
  isOpen = true, 
  onClose, 
  className = "",
  containerClassName = "w-full max-w-md"
}) {
  if (!isOpen || typeof document === "undefined") return null;

  const handleBackdropClick = (e) => {
    // Only trigger onClose if the backdrop itself is clicked, not its children
    if (e.target === e.currentTarget && onClose) {
      onClose();
    }
  };

  const overlayContent = (
    <div 
      className={`fixed inset-0 z-[9999] grid place-items-center bg-slate-950/20 backdrop-blur-sm transition-all px-4 ${className}`}
      onClick={handleBackdropClick}
      aria-modal="true"
      role="dialog"
    >
      <div className={`${containerClassName} animate-in fade-in zoom-in duration-200`}>
        {children}
      </div>
    </div>
  );

  return createPortal(overlayContent, document.body);
}
