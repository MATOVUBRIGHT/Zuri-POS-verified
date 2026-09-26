import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { StockItem } from '@/types';
import { ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

export interface PrintItem {
  product: StockItem;
  quantity: number;
}

export type Orientation = 'portrait' | 'landscape';

export interface ShowFields {
  productName: boolean;
  barcode: boolean;
  price: boolean;
  sku: boolean;
}

type LabelSizeType =
  | '58mm'
  | '80mm'
  | '30x20mm'
  | '40x25mm'
  | '50x25mm'
  | '50x30mm'
  | '60x40mm'
  | '70x50mm'
  | '100x50mm'
  | 'custom';

interface LabelPreviewProps {
  printItems: PrintItem[];
  labelSizeType: LabelSizeType;
  customWidthMm?: number;
  customHeightMm?: number;
  previewScale?: number;
  onScaleChange?: (scale: number) => void;

  // Controlled preview options (used so print output matches preview).
  orientation?: Orientation;
  onOrientationChange?: (o: Orientation) => void;
  showFields?: ShowFields;
  onShowFieldsChange?: (fields: ShowFields) => void;

  // Sheet layout preview (columns x rows per printed page).
  columnsPerPage?: number;
  rowsPerPage?: number;
}

export default function LabelPreview({
  printItems,
  labelSizeType,
  customWidthMm = 58,
  customHeightMm = 60,
  previewScale = 100,
  onScaleChange,
  orientation: orientationProp,
  onOrientationChange,
  showFields: showFieldsProp,
  onShowFieldsChange,
  columnsPerPage = 1,
  rowsPerPage = 1,
}: LabelPreviewProps) {
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const barcodeRefsMap = useRef<Map<string, SVGSVGElement | null>>(new Map());

  const [orientationState, setOrientationState] = useState<Orientation>(orientationProp ?? 'portrait');
  const currentOrientation: Orientation = orientationProp ?? orientationState;

  const defaultShowFields: ShowFields = {
    productName: true,
    barcode: true,
    price: true,
    sku: true,
  };
  const [showFieldsState, setShowFieldsState] = useState<ShowFields>(showFieldsProp ?? defaultShowFields);
  const currentShowFields: ShowFields = showFieldsProp ?? showFieldsState;

  // Keep internal state in sync when controlled by parent.
  useEffect(() => {
    if (orientationProp) setOrientationState(orientationProp);
  }, [orientationProp]);

  useEffect(() => {
    if (showFieldsProp) setShowFieldsState(showFieldsProp);
  }, [showFieldsProp]);

  // Determine label dimensions with orientation support
  const getLabelDimensions = () => {
    let baseWidth = 58;
    let baseHeight = 60;

    switch (labelSizeType) {
      case '58mm':
        baseWidth = 58;
        baseHeight = 60;
        break;
      case '80mm':
        baseWidth = 80;
        baseHeight = 60;
        break;
      case '30x20mm':
        baseWidth = 30;
        baseHeight = 20;
        break;
      case '40x25mm':
        baseWidth = 40;
        baseHeight = 25;
        break;
      case '50x25mm':
        baseWidth = 50;
        baseHeight = 25;
        break;
      case '50x30mm':
        baseWidth = 50;
        baseHeight = 30;
        break;
      case '60x40mm':
        baseWidth = 60;
        baseHeight = 40;
        break;
      case '70x50mm':
        baseWidth = 70;
        baseHeight = 50;
        break;
      case '100x50mm':
        baseWidth = 100;
        baseHeight = 50;
        break;
      case 'custom':
        baseWidth = customWidthMm || 58;
        baseHeight = customHeightMm || 60;
        break;
    }

    // Apply orientation
    if (currentOrientation === 'landscape') {
      return { width: baseHeight, height: baseWidth }; // Swap for landscape
    }
    return { width: baseWidth, height: baseHeight };
  };

  const { width: labelWidth, height: labelHeight } = getLabelDimensions();
  const scale = previewScale / 100;
  const displayWidth = labelWidth * scale;
  const displayHeight = labelHeight * scale;

  const safeColumnsPerPage = Math.max(1, Math.floor(columnsPerPage));
  const safeRowsPerPage = Math.max(1, Math.floor(rowsPerPage));
  const labelsPerPage = safeColumnsPerPage * safeRowsPerPage;
  const flatLabelInstances = printItems.flatMap((item) =>
    Array.from({ length: item.quantity }).map((_, idx) => ({
      // Use a delimiter that won't collide with UUID hyphens.
      key: `${item.product.id}__${idx}`,
      product: item.product,
      idx,
    }))
  );

  // Render barcodes using JsBarcode from CDN
  useEffect(() => {
    const loadAndRenderBarcodes = () => {
      const JsBarcode = (window as any).JsBarcode;
      
      if (!JsBarcode) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
        script.onload = () => {
          renderBarcodes();
        };
        document.head.appendChild(script);
      } else {
        renderBarcodes();
      }
    };

    const renderBarcodes = () => {
      const JsBarcode = (window as any).JsBarcode;
      if (!JsBarcode) return;
      const jsBarcodeHeightPx = Math.max(12, Math.min(30, Math.round(labelHeight * 0.55)));

      barcodeRefsMap.current.forEach((svg, key) => {
        if (svg && !svg.querySelector('text')) {
          const productId = key.split('__')[0];
          const item = printItems.find(pi => pi.product.id === productId);
          
          if (item?.product.barcode) {
            try {
              JsBarcode(svg, item.product.barcode, {
                format: 'CODE128',
                width: 1.5,
                height: jsBarcodeHeightPx,
                displayValue: false,
                margin: 2,
              });
            } catch (err) {
              console.error(`Failed to render barcode for ${productId}:`, err);
            }
          }
        }
      });
    };

    const timer = setTimeout(loadAndRenderBarcodes, 100);
    return () => clearTimeout(timer);
  }, [printItems, labelHeight, currentShowFields.barcode]);

  const toggleField = (field: keyof ShowFields) => {
    const next: ShowFields = {
      ...currentShowFields,
      [field]: !currentShowFields[field],
    };
    onShowFieldsChange?.(next);
    if (!showFieldsProp) setShowFieldsState(next); // Uncontrolled mode
  };

  const setOrientationSafe = (o: Orientation) => {
    onOrientationChange?.(o);
    if (!orientationProp) setOrientationState(o); // Uncontrolled mode
  };

  return (
    <div className="space-y-3">
      {/* Controls Row 1: Zoom and Orientation */}
      <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-700">Zoom:</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onScaleChange?.(Math.max(50, previewScale - 10))}
            disabled={previewScale <= 50}
            title="Zoom out"
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          <span className="text-xs font-semibold w-12 text-center">{previewScale}%</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onScaleChange?.(Math.min(200, previewScale + 10))}
            disabled={previewScale >= 200}
            title="Zoom in"
          >
            <ZoomIn className="h-3 w-3" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={currentOrientation === 'portrait' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setOrientationSafe('portrait')}
          >
            Portrait
          </Button>
          <Button
            variant={currentOrientation === 'landscape' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs flex items-center gap-1"
            onClick={() => setOrientationSafe('landscape')}
          >
            <RotateCw className="h-3 w-3" />
            Landscape
          </Button>
        </div>

        <div className="text-xs text-gray-600">
          <strong>{labelWidth}mm × {labelHeight}mm</strong>
          <span className="text-gray-500"> ({currentOrientation})</span>
        </div>
      </div>

      {/* Controls Row 2: Field Visibility */}
      <div className="p-3 bg-blue-50 rounded border border-blue-200">
        <div className="text-xs font-semibold text-blue-900 mb-2">Show Fields:</div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={currentShowFields.productName}
              onChange={() => toggleField('productName')}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span>Product Name</span>
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={currentShowFields.barcode}
              onChange={() => toggleField('barcode')}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span>Barcode</span>
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={currentShowFields.price}
              onChange={() => toggleField('price')}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span>Price</span>
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={currentShowFields.sku}
              onChange={() => toggleField('sku')}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span>SKU</span>
          </label>
        </div>
      </div>

      {/* Live Preview Container */}
      <div 
        ref={previewContainerRef}
        className="bg-white border-2 border-dashed border-gray-400 rounded overflow-auto shadow-sm"
        style={{ maxHeight: '450px', backgroundColor: '#fafafa' }}
      >
        {printItems.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <div className="text-center">
              <p className="text-sm font-medium">No products to preview</p>
              <p className="text-xs mt-1">Add products to the queue to see label design</p>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {(() => {
              const pageCount = Math.ceil(flatLabelInstances.length / labelsPerPage);
              const sheetWidthPx = displayWidth * safeColumnsPerPage;
              const sheetHeightPx = displayHeight * safeRowsPerPage;

              return Array.from({ length: pageCount }).map((_, pageIndex) => {
                const pageLabels = flatLabelInstances.slice(
                  pageIndex * labelsPerPage,
                  (pageIndex + 1) * labelsPerPage
                );

                return (
                  <div
                    key={pageIndex}
                    style={{
                      width: sheetWidthPx,
                      height: sheetHeightPx,
                      backgroundColor: '#fff',
                      border: '1px solid #e5e7eb',
                      display: 'grid',
                      gridTemplateColumns: `repeat(${safeColumnsPerPage}, ${displayWidth}px)`,
                      gridTemplateRows: `repeat(${safeRowsPerPage}, ${displayHeight}px)`,
                      overflow: 'hidden',
                    }}
                  >
                    {pageLabels.map((inst) => {
                      const barcode = inst.product.barcode;
                      const price = inst.product.retail_price
                        ? `UGX ${inst.product.retail_price.toLocaleString()}`
                        : 'N/A';

                      return (
                        <div
                          key={inst.key}
                          style={{
                            width: displayWidth,
                            height: displayHeight,
                            minWidth: displayWidth,
                            minHeight: displayHeight,
                            position: 'relative',
                            overflow: 'hidden',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#fff',
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              width: '90%',
                              textAlign: 'center',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: `${Math.max(1, scale * 1.2)}px`,
                              lineHeight: '1.1',
                            }}
                          >
                            {currentShowFields.productName && (
                              <div
                                style={{
                                  fontSize: `${scale * 9}px`,
                                  fontWeight: 'bold',
                                  width: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={inst.product.productName}
                              >
                                {inst.product.productName}
                              </div>
                            )}

                            {currentShowFields.barcode && barcode && (
                              <svg
                                ref={(el) => {
                                  if (el) barcodeRefsMap.current.set(inst.key, el);
                                }}
                                className="barcode-svg"
                                style={{
                                  width: '90%',
                                  height: 'auto',
                                  maxHeight: `${Math.max(25, displayHeight * 0.3)}px`,
                                }}
                              />
                            )}

                            {currentShowFields.price && (
                              <div
                                style={{
                                  fontSize: `${scale * 8}px`,
                                  fontWeight: 'bold',
                                  width: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {price}
                              </div>
                            )}

                            {currentShowFields.sku && barcode && (
                              <div
                                style={{
                                  fontSize: `${scale * 6}px`,
                                  color: '#666',
                                  width: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontFamily: 'monospace',
                                }}
                                title={barcode}
                              >
                                {barcode}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* Label Specifications */}
      <div className="text-xs bg-green-50 border border-green-200 rounded p-3">
        <div className="font-semibold text-green-900 mb-2">Label Specifications:</div>
        <div className="grid grid-cols-2 gap-2 text-green-800">
          <div>📐 Size: {labelWidth}mm × {labelHeight}mm</div>
          <div>🔀 Orientation: {currentOrientation}</div>
          <div>🏷️ Total: {printItems.reduce((sum, item) => sum + item.quantity, 0)} labels</div>
          <div>👁️ Fields: {Object.values(currentShowFields).filter(Boolean).length} visible</div>
        </div>
      </div>
    </div>
  );
}
