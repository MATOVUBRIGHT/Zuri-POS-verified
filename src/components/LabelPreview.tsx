import { useEffect, useRef, useState, useCallback } from 'react';
import { fmtCurrency, getCurrencySymbol } from "@/lib/currency";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StockItem } from '@/types';
import { ZoomIn, ZoomOut, RotateCw, ArrowUp, ArrowDown, Bold, Italic } from 'lucide-react';

export interface PrintItem { product: StockItem; quantity: number; }
export type Orientation = 'portrait' | 'landscape';
export interface ShowFields { productName: boolean; barcode: boolean; price: boolean; sku: boolean; }
export type FieldKey = 'productName' | 'barcode' | 'price' | 'sku';
export type LabelSizeType = '58mm'|'80mm'|'30x20mm'|'40x25mm'|'50x25mm'|'50x30mm'|'60x40mm'|'70x50mm'|'100x50mm'|'custom';

export interface LabelStyle {
  fontFamily: string;
  nameFontSizeMm: number;
  priceFontSizeMm: number;
  skuFontSizeMm: number;
  paddingMm: number;
  gapMm: number;
  nameBold: boolean;
  nameItalic: boolean;
  priceBold: boolean;
  priceItalic: boolean;
  skuBold: boolean;
  skuItalic: boolean;
  textAlign: 'left' | 'center' | 'right';
  barcodeHeightMm: number;   // 0 = auto
  barcodeModuleWidth?: number; // 0/undefined = auto
  barcodeFormat: string;     // CODE128, EAN13, EAN8, UPC, CODE39, QR
}

export const DEFAULT_STYLE: LabelStyle = {
  fontFamily: 'Arial',
  nameFontSizeMm: 0,
  priceFontSizeMm: 0,
  skuFontSizeMm: 0,
  paddingMm: 0,
  gapMm: 0,
  nameBold: true, nameItalic: false,
  priceBold: true, priceItalic: false,
  skuBold: false, skuItalic: false,
  textAlign: 'center',
  barcodeHeightMm: 0,
  barcodeFormat: 'CODE128',
};

const BARCODE_FORMATS = ['CODE128','CODE39','EAN13','EAN8','UPC','ITF14','QR'];
const FONTS = ['Arial','Helvetica','Times New Roman','Courier New','Georgia','Verdana','Tahoma','Trebuchet MS'];
const ALIGNS: Array<'left'|'center'|'right'> = ['left','center','right'];
const DEFAULT_ORDER: FieldKey[] = ['productName','barcode','price','sku'];
const FIELD_LABELS: Record<FieldKey,string> = { productName:'Name', barcode:'Barcode', price:'Price', sku:'SKU' };

interface LabelPreviewProps {
  printItems: PrintItem[];
  labelSizeType: LabelSizeType;
  customWidthMm?: number;
  customHeightMm?: number;
  previewScale?: number;
  onScaleChange?: (s: number) => void;
  orientation?: Orientation;
  onOrientationChange?: (o: Orientation) => void;
  showFields?: ShowFields;
  onShowFieldsChange?: (f: ShowFields) => void;
  fieldOrder?: FieldKey[];
  onFieldOrderChange?: (o: FieldKey[]) => void;
  labelStyle?: LabelStyle;
  onLabelStyleChange?: (s: LabelStyle) => void;
  columnsPerPage?: number;
  rowsPerPage?: number;
}

function getBaseDimensions(sizeType: LabelSizeType, cw=58, ch=60) {
  const m: Record<string,[number,number]> = {
    '58mm':[58,60],'80mm':[80,60],'30x20mm':[30,20],'40x25mm':[40,25],
    '50x25mm':[50,25],'50x30mm':[50,30],'60x40mm':[60,40],
    '70x50mm':[70,50],'100x50mm':[100,50],'custom':[cw,ch],
  };
  const [w,h]=m[sizeType]??[58,60]; return {w,h};
}
function applyOrientation(w:number,h:number,o:Orientation){
  return o==='landscape'?{width:h,height:w}:{width:w,height:h};
}
function ensureJsBarcode():Promise<void>{
  return new Promise(r=>{
    if((window as any).JsBarcode){r();return;}
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js';
    s.onload=()=>r(); s.onerror=()=>r();
    document.head.appendChild(s);
  });
}

function resolveStyle(s: LabelStyle, lw: number, lh: number) {
  const MM = 3.7795;
  // A linear barcode is a wide scanner target, not a square. Keep preview
  // height under the same 2.5:1 landscape guard used by raw printer output.
  const maxBarcodeHmm = Math.max(2, lw / 2.5);
  const autoBarcodeHmm = Math.min(maxBarcodeHmm, Math.max(3, lh * 0.20));
  const barcodeHmm = Math.min(maxBarcodeHmm, s.barcodeHeightMm || autoBarcodeHmm);
  return {
    font: s.fontFamily || 'Arial',
    nameMm:  s.nameFontSizeMm  || Math.max(1.8, lh*0.13),
    priceMm: s.priceFontSizeMm || Math.max(1.6, lh*0.12),
    skuMm:   s.skuFontSizeMm   || Math.max(1.2, lh*0.09),
    padMm:   s.paddingMm       || Math.max(1.2, lh*0.06),
    gapMm:   s.gapMm           || Math.max(1.0, lh*0.06),
    barcodeHmm,
    barcodeHpx: barcodeHmm * MM,
    align:   s.textAlign || 'center',
    namePx:  (s.nameFontSizeMm  || Math.max(1.8, lh*0.13)) * MM,
    pricePx: (s.priceFontSizeMm || Math.max(1.6, lh*0.12)) * MM,
    skuPx:   (s.skuFontSizeMm   || Math.max(1.2, lh*0.09)) * MM,
    padPx:   (s.paddingMm       || Math.max(1.2, lh*0.06)) * MM,
    gapPx:   (s.gapMm           || Math.max(1.0, lh*0.06)) * MM,
  };
}

// ─── generatePrintHTML ───────────────────────────────────────────────────────
export function generatePrintHTML(
  printItems: PrintItem[],
  labelSizeType: LabelSizeType,
  showFields: ShowFields,
  orientation: Orientation,
  customWidthMm=58, customHeightMm=60,
  fieldOrder: FieldKey[]=DEFAULT_ORDER,
  style: LabelStyle=DEFAULT_STYLE,
): string {
  const {w:bw,h:bh}=getBaseDimensions(labelSizeType,customWidthMm,customHeightMm);
  const {width:lw,height:lh}=applyOrientation(bw,bh,orientation);
  const r=resolveStyle(style,lw,lh);
  const barcodeHpx=Math.round(r.barcodeHmm*3.7795);
  const barcodeFormat=style.barcodeFormat||'CODE128';

  const instances:{product:StockItem;idx:number}[]=[];
  for(const item of printItems)
    for(let i=0;i<item.quantity;i++)
      instances.push({product:item.product,idx:instances.length});

  const css=`
    *{margin:0;padding:0;box-sizing:border-box;}
    html,body{background:#fff;font-family:'${r.font}',Arial,sans-serif;width:${lw}mm;}
    .label{
      width:${lw}mm;height:${lh}mm;max-width:${lw}mm;max-height:${lh}mm;
      overflow:hidden;display:flex;flex-direction:column;
      align-items:stretch;justify-content:space-between;
      padding:${r.padMm}mm;gap:0;background:#fff;
      page-break-after:always;page-break-inside:avoid;break-after:page;
    }
    .label:last-child{page-break-after:avoid;break-after:avoid;}
    .label-top{display:flex;flex-direction:column;align-items:stretch;gap:${r.gapMm}mm;flex:1;justify-content:space-between;padding-bottom:${r.gapMm}mm;}
    .label-footer{display:flex;flex-direction:row;align-items:center;justify-content:space-between;margin-top:${r.gapMm}mm;flex-shrink:0;}
    /* All fields share the same width — barcode matches text start/end */
    .f,.f-barcode{width:100%;max-width:100%;}
    .f{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:${r.align};}
    .f-name{font-size:${r.nameMm}mm;font-weight:${style.nameBold?'bold':'normal'};font-style:${style.nameItalic?'italic':'normal'};line-height:1.15;flex-shrink:0;}
    .f-price{font-size:${r.priceMm}mm;font-weight:${style.priceBold?'bold':'normal'};font-style:${style.priceItalic?'italic':'normal'};flex-shrink:0;}
    .f-price-currency{font-size:${r.priceMm}mm;font-weight:${style.priceBold?'bold':'normal'};}
    .f-price-amount{font-size:${r.priceMm}mm;font-weight:${style.priceBold?'bold':'normal'};font-style:${style.priceItalic?'italic':'normal'};}
    .f-sku{font-size:${r.skuMm}mm;color:#444;font-family:monospace;font-weight:${style.skuBold?'bold':'normal'};font-style:${style.skuItalic?'italic':'normal'};flex-shrink:0;text-align:center;}
    .f-barcode{display:flex;justify-content:${r.align==='left'?'flex-start':r.align==='right'?'flex-end':'center'};align-items:center;overflow:hidden;flex-shrink:0;height:${r.barcodeHmm}mm;width:100%;margin-top:2mm;margin-bottom:2mm;}
    .f-barcode svg{width:auto;max-width:100%;height:100%;display:block;}
    @media print{
      @page{margin:0;size:${lw}mm ${lh}mm;}
      html,body{width:${lw}mm;height:${lh}mm;}
      .label{border:none!important;width:${lw}mm!important;height:${lh}mm!important;max-width:${lw}mm!important;max-height:${lh}mm!important;}
    }
  `;

  const activeOrder=fieldOrder.filter(f=>showFields[f]);
  const labelsHTML=instances.map(({product,idx})=>{
    const barcode=product.barcode||'';
    const rawPrice=product.retail_price||0;
    // Format price with "Ugx" casing (sentence case)
    const currencySymbol=getCurrencySymbol().replace(/^UGX$/,'Ugx');
    const priceAmount=Math.round(rawPrice).toLocaleString();

    // Separate price from other fields — price always goes to footer
    const topFields=activeOrder.filter(f=>f!=='price').map(f=>{
      if(f==='productName') return `<div class="f f-name">${product.productName.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`;
      if(f==='barcode'&&barcode) return `<div class="f-barcode"><svg id="bc-${idx}" data-value="${barcode}" data-height="${barcodeHpx}" data-format="${barcodeFormat}"></svg></div>`;
      if(f==='sku'&&barcode) return `<div class="f f-sku">${barcode}</div>`;
      return '';
    }).filter(Boolean).join('\n');

    const footerHTML=showFields['price']&&rawPrice
      ? `<div class="label-footer"><span class="f-price-currency">${currencySymbol}</span><span class="f-price-amount">${priceAmount}</span></div>`
      : '';

    return `<div class="label"><div class="label-top">\n${topFields}\n</div>${footerHTML}</div>`;
  }).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Labels</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
<style>${css}</style></head><body>${labelsHTML}
<script>(function(){
  function render(){
    document.querySelectorAll('svg[data-value]').forEach(function(svg){
      var val=svg.getAttribute('data-value'),h=parseInt(svg.getAttribute('data-height')||'20',10),fmt=svg.getAttribute('data-format')||'CODE128';
      if(!val)return;
      try{JsBarcode(svg,val,{format:fmt,width:${Math.max(1, Math.min(10, style.barcodeModuleWidth || 2))},height:40,displayValue:false,margin:0});
        svg.style.width='auto';svg.style.maxWidth='100%';svg.style.height='100%';svg.style.display='block';}catch(e){}
    });
    setTimeout(function(){window.print();},500);
  }
  typeof JsBarcode!=='undefined'?(document.readyState==='loading'?document.addEventListener('DOMContentLoaded',render):render()):window.addEventListener('load',render);
})();<\/script></body></html>`;
}

// ─── LabelPreview component ──────────────────────────────────────────────────
export default function LabelPreview({
  printItems, labelSizeType, customWidthMm=58, customHeightMm=60,
  previewScale=100, onScaleChange,
  orientation:orientationProp, onOrientationChange,
  showFields:showFieldsProp, onShowFieldsChange,
  fieldOrder:fieldOrderProp, onFieldOrderChange,
  labelStyle:labelStyleProp, onLabelStyleChange,
  columnsPerPage=1, rowsPerPage=1,
}: LabelPreviewProps) {
  const barcodeRefsMap=useRef<Map<string,SVGSVGElement|null>>(new Map());
  const [orientationState,setOrientationState]=useState<Orientation>(orientationProp??'portrait');
  const orientation:Orientation=orientationProp??orientationState;
  const [showFieldsState,setShowFieldsState]=useState<ShowFields>(showFieldsProp??{productName:true,barcode:true,price:true,sku:false});
  const showFields:ShowFields=showFieldsProp??showFieldsState;
  const [fieldOrderState,setFieldOrderState]=useState<FieldKey[]>(fieldOrderProp??DEFAULT_ORDER);
  const fieldOrder:FieldKey[]=fieldOrderProp??fieldOrderState;
  const [styleState,setStyleState]=useState<LabelStyle>(labelStyleProp??DEFAULT_STYLE);
  const style:LabelStyle=labelStyleProp??styleState;

  useEffect(()=>{if(orientationProp)setOrientationState(orientationProp);},[orientationProp]);
  useEffect(()=>{if(showFieldsProp)setShowFieldsState(showFieldsProp);},[showFieldsProp]);
  useEffect(()=>{if(fieldOrderProp)setFieldOrderState(fieldOrderProp);},[fieldOrderProp]);
  useEffect(()=>{if(labelStyleProp)setStyleState(labelStyleProp);},[labelStyleProp]);

  const MM=3.7795;
  const {w:bw,h:bh}=getBaseDimensions(labelSizeType,customWidthMm,customHeightMm);
  const {width:labelWmm,height:labelHmm}=applyOrientation(bw,bh,orientation);
  const sc=previewScale/100;
  const labelWpx=labelWmm*MM*sc;
  const labelHpx=labelHmm*MM*sc;
  const cols=Math.max(1,Math.floor(columnsPerPage));
  const rows=Math.max(1,Math.floor(rowsPerPage));
  const labelsPerPage=cols*rows;
  const instances=printItems.flatMap(item=>
    Array.from({length:item.quantity}).map((_,i)=>({key:`${item.product.id}__${i}`,product:item.product}))
  );
  const r=resolveStyle(style,labelWmm,labelHmm);

  const renderBarcodes=useCallback(async()=>{
    await ensureJsBarcode();
    const JsBarcode=(window as any).JsBarcode;
    if(!JsBarcode)return;
    // Use a fixed internal height for JsBarcode (doesn't matter — we override with CSS)
    const internalH=40;
    const fmt=style.barcodeFormat||'CODE128';
    barcodeRefsMap.current.forEach((svg,key)=>{
      if(!svg)return;
      const pid=key.split('__')[0];
      const item=printItems.find(pi=>pi.product.id===pid);
      if(!item?.product.barcode)return;
      while(svg.firstChild)svg.removeChild(svg.firstChild);
      try{
        JsBarcode(svg,item.product.barcode,{format:fmt,width:Math.max(1,Math.min(10,style.barcodeModuleWidth||2)),height:internalH,displayValue:false,margin:0});
        // Override JsBarcode's own width/height attrs — let CSS control the size
        svg.style.width='auto';
        svg.style.maxWidth='100%';
        svg.style.height='100%';
        svg.style.display='block';
        // Height is controlled by the parent container div
      }
      catch(e){console.warn('barcode preview error',e);}
    });
  },[printItems,style.barcodeFormat,style.barcodeModuleWidth]);

  useEffect(()=>{
    if(!showFields.barcode)return;
    const t=setTimeout(renderBarcodes,80);
    return()=>clearTimeout(t);
  },[renderBarcodes,showFields.barcode,fieldOrder,style]);

  const toggleField=(f:FieldKey)=>{
    const next={...showFields,[f]:!showFields[f]};
    onShowFieldsChange?.(next);if(!showFieldsProp)setShowFieldsState(next);
  };
  const moveField=(idx:number,dir:-1|1)=>{
    const next=[...fieldOrder];const t=idx+dir;
    if(t<0||t>=next.length)return;
    [next[idx],next[t]]=[next[t],next[idx]];
    onFieldOrderChange?.(next);if(!fieldOrderProp)setFieldOrderState(next);
  };
  const setOriSafe=(o:Orientation)=>{onOrientationChange?.(o);if(!orientationProp)setOrientationState(o);};
  const patchStyle=(patch:Partial<LabelStyle>)=>{
    const next={...style,...patch};
    onLabelStyleChange?.(next);if(!labelStyleProp)setStyleState(next);
  };

  const activeOrder=fieldOrder.filter(f=>showFields[f]);
  const padPx=r.padPx*sc;
  const gapPx=r.gapPx*sc;

  return (
    <div className="flex gap-0 h-full">
      {/* ── LEFT: controls panel — wider, readable font sizes ── */}
      <div className="w-96 shrink-0 border-r bg-muted/10 overflow-y-auto p-4 space-y-4">

        {/* Zoom + orientation */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-medium w-12">Zoom</span>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0"
              onClick={()=>onScaleChange?.(Math.max(40,previewScale-10))} disabled={previewScale<=40}><ZoomOut className="h-4 w-4"/></Button>
            <span className="w-12 text-center text-sm font-semibold">{previewScale}%</span>
            <Button variant="outline" size="sm" className="h-7 w-7 p-0"
              onClick={()=>onScaleChange?.(Math.min(300,previewScale+10))} disabled={previewScale>=300}><ZoomIn className="h-4 w-4"/></Button>
          </div>
          <div className="flex gap-2">
            <Button variant={orientation==='portrait'?'default':'outline'} size="sm" className="h-8 text-sm px-3 flex-1"
              onClick={()=>setOriSafe('portrait')}>Portrait</Button>
            <Button variant={orientation==='landscape'?'default':'outline'} size="sm" className="h-8 text-sm px-3 flex-1 gap-1"
              onClick={()=>setOriSafe('landscape')}><RotateCw className="h-3.5 w-3.5"/>Landscape</Button>
          </div>
          <p className="text-xs text-muted-foreground">{labelWmm}×{labelHmm}mm</p>
        </div>

        <div className="border-t"/>

        {/* Font */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">Font</p>
          <Select value={style.fontFamily} onValueChange={v=>patchStyle({fontFamily:v})}>
            <SelectTrigger className="h-9 text-sm"><SelectValue/></SelectTrigger>
            <SelectContent>{FONTS.map(f=><SelectItem key={f} value={f} className="text-sm" style={{fontFamily:f}}>{f}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex gap-1">
            {ALIGNS.map(a=>(
              <button key={a} onClick={()=>patchStyle({textAlign:a})}
                className={`flex-1 h-8 rounded border text-sm capitalize transition-colors ${style.textAlign===a?'bg-primary text-primary-foreground':'hover:bg-muted'}`}>{a}</button>
            ))}
          </div>
        </div>

        <div className="border-t"/>

        {/* Spacing */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">Spacing (mm)</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Padding</Label>
              <Input type="number" min={0} max={10} step={0.5}
                value={style.paddingMm||''} placeholder="auto"
                onChange={e=>patchStyle({paddingMm:parseFloat(e.target.value)||0})}
                className="h-8 text-sm"/>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Gap</Label>
              <Input type="number" min={0} max={5} step={0.2}
                value={style.gapMm||''} placeholder="auto"
                onChange={e=>patchStyle({gapMm:parseFloat(e.target.value)||0})}
                className="h-8 text-sm"/>
            </div>
          </div>
        </div>

        <div className="border-t"/>

        {/* Fields */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">Fields &amp; Order</p>
          {fieldOrder.map((f,idx)=>(
            <div key={f} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={showFields[f]} onChange={()=>toggleField(f)} className="h-4 w-4 rounded shrink-0"/>
                <span className={`flex-1 text-sm font-medium ${showFields[f]?'text-foreground':'text-muted-foreground line-through'}`}>{FIELD_LABELS[f]}</span>
                <button onClick={()=>moveField(idx,-1)} disabled={idx===0}
                  className="p-1 rounded hover:bg-muted disabled:opacity-25 transition-opacity"><ArrowUp className="h-3.5 w-3.5"/></button>
                <button onClick={()=>moveField(idx,1)} disabled={idx===fieldOrder.length-1}
                  className="p-1 rounded hover:bg-muted disabled:opacity-25 transition-opacity"><ArrowDown className="h-3.5 w-3.5"/></button>
              </div>
              {f!=='barcode'&&showFields[f]&&(
                <div className="flex items-center gap-2 pl-6">
                  <div className="flex items-center gap-1 flex-1">
                    <Input type="number" min={1} max={20} step={0.5} placeholder="auto"
                      value={f==='productName'?style.nameFontSizeMm||'':f==='price'?style.priceFontSizeMm||'':style.skuFontSizeMm||''}
                      onChange={e=>{const v=parseFloat(e.target.value)||0;patchStyle(f==='productName'?{nameFontSizeMm:v}:f==='price'?{priceFontSizeMm:v}:{skuFontSizeMm:v});}}
                      className="h-7 w-16 text-sm"/>
                    <span className="text-xs text-muted-foreground">mm</span>
                  </div>
                  <button onClick={()=>patchStyle(f==='productName'?{nameBold:!style.nameBold}:f==='price'?{priceBold:!style.priceBold}:{skuBold:!style.skuBold})}
                    className={`h-7 w-7 rounded border flex items-center justify-center transition-colors ${(f==='productName'?style.nameBold:f==='price'?style.priceBold:style.skuBold)?'bg-primary text-primary-foreground':'hover:bg-muted'}`}>
                    <Bold className="h-3.5 w-3.5"/></button>
                  <button onClick={()=>patchStyle(f==='productName'?{nameItalic:!style.nameItalic}:f==='price'?{priceItalic:!style.priceItalic}:{skuItalic:!style.skuItalic})}
                    className={`h-7 w-7 rounded border flex items-center justify-center transition-colors ${(f==='productName'?style.nameItalic:f==='price'?style.priceItalic:style.skuItalic)?'bg-primary text-primary-foreground':'hover:bg-muted'}`}>
                    <Italic className="h-3.5 w-3.5"/></button>
                </div>
              )}
              {f==='barcode'&&showFields[f]&&(
                <div className="space-y-2 pl-6">
                  <div className="flex items-center gap-2">
                    <Input type="number" min={2} max={30} step={0.5} placeholder="auto"
                      value={style.barcodeHeightMm||''}
                      onChange={e=>patchStyle({barcodeHeightMm:parseFloat(e.target.value)||0})}
                      className="h-7 w-16 text-sm"/>
                    <span className="text-xs text-muted-foreground">mm height</span>
                  </div>
                  <Select value={style.barcodeFormat||'CODE128'} onValueChange={v=>patchStyle({barcodeFormat:v})}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue/></SelectTrigger>
                    <SelectContent>
                      {BARCODE_FORMATS.map(bf=><SelectItem key={bf} value={bf} className="text-sm">{bf}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t"/>
        <p className="text-xs text-muted-foreground">
          {instances.length} label{instances.length!==1?'s':''} · {activeOrder.length} field{activeOrder.length!==1?'s':''}
        </p>
      </div>

      {/* ── CENTER: label preview — centered, natural width ── */}
      <div className="flex-1 min-w-0 overflow-auto bg-gray-50 flex items-start justify-center p-6">
        {instances.length===0?(
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            Add products to see preview
          </div>
        ):(
          <div className="space-y-3">
            {Array.from({length:Math.ceil(instances.length/labelsPerPage)}).map((_,pageIdx)=>{
              const pageInsts=instances.slice(pageIdx*labelsPerPage,(pageIdx+1)*labelsPerPage);
              return (
                <div key={pageIdx}
                  style={{
                    display:'inline-grid',
                    gridTemplateColumns:`repeat(${cols},${labelWpx}px)`,
                    gridTemplateRows:`repeat(${rows},${labelHpx}px)`,
                    background:'#fff',
                    border:'2px solid #d1d5db',
                    borderRadius:4,
                    boxShadow:'0 2px 8px rgba(0,0,0,0.08)',
                  }}>
                  {pageInsts.map(inst=>{
                    const rawPrice=inst.product.retail_price||0;
                    const currSym=getCurrencySymbol().replace(/^UGX$/,'Ugx');
                    const priceAmt=Math.round(rawPrice).toLocaleString();
                    const barcode=inst.product.barcode||'';
                    const topOrder=activeOrder.filter(f=>f!=='price');
                    return (
                      <div key={inst.key} style={{
                        width:labelWpx,height:labelHpx,overflow:'hidden',
                        border:'1px solid #e5e7eb',background:'#fff',
                        display:'flex',flexDirection:'column',
                        alignItems:'stretch',justifyContent:'space-between',
                        padding:`${padPx}px`,gap:0,
                        boxSizing:'border-box',fontFamily:`'${r.font}',Arial,sans-serif`,
                      }}>
                        {/* Top section: name, barcode, sku */}
                        <div style={{display:'flex',flexDirection:'column',gap:`${gapPx}px`,flex:1,justifyContent:'space-between',paddingBottom:`${gapPx}px`}}>
                        {topOrder.map(f=>{
                          const base:React.CSSProperties={
                            width:'100%',overflow:'hidden',textOverflow:'ellipsis',
                            whiteSpace:'nowrap',textAlign:r.align,flexShrink:0,
                          };
                          if(f==='productName') return (
                            <div key="n" style={{...base,fontSize:r.namePx*sc,fontWeight:style.nameBold?'bold':'normal',fontStyle:style.nameItalic?'italic':'normal',lineHeight:1.15}} title={inst.product.productName}>
                              {inst.product.productName}
                            </div>
                          );
                          if(f==='barcode'&&barcode) return (
                            <div key="b" style={{
                              width:'100%',
                              height:`${r.barcodeHpx*sc}px`,
                              flexShrink:0,
                              overflow:'hidden',
                              marginTop:`${2*sc}px`,
                              marginBottom:`${2*sc}px`,
                            }}>
                              <svg ref={el=>{barcodeRefsMap.current.set(inst.key,el);}}
                                style={{width:'100%',height:'100%',display:'block'}}/>
                            </div>
                          );
                          if(f==='sku'&&barcode) return (
                            <div key="s" style={{...base,fontSize:r.skuPx*sc,fontWeight:style.skuBold?'bold':'normal',fontStyle:style.skuItalic?'italic':'normal',fontFamily:'monospace',color:'#555',textAlign:'center'}} title={barcode}>{barcode}</div>
                          );
                          return null;
                        })}
                        </div>
                        {/* Footer: currency left, amount right */}
                        {showFields['price']&&rawPrice>0&&(
                          <div style={{display:'flex',flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexShrink:0,marginTop:`${gapPx}px`,fontSize:r.pricePx*sc,fontWeight:style.priceBold?'bold':'normal',fontStyle:style.priceItalic?'italic':'normal'}}>
                            <span>{currSym}</span>
                            <span>{priceAmt}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
