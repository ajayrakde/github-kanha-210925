import { cn } from "./utils";

interface PrintOptions {
  title?: string;
}

export function printElementWithStyles(element: HTMLElement, options: PrintOptions = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const printWindow = window.open("", "_blank", "width=900,height=650");
  if (!printWindow) {
    throw new Error("Unable to open print window");
  }

  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll<HTMLElement>("[data-print-hidden='true']").forEach((node) => {
    node.remove();
  });

  printWindow.document.open();
  printWindow.document.write(
    `<!DOCTYPE html><html><head><title>${options.title ?? document.title}</title></head><body></body></html>`,
  );

  const { document: printDocument } = printWindow;
  const head = printDocument.head;
  document
    .querySelectorAll("style, link[rel='stylesheet']")
    .forEach((styleNode) => head.appendChild(styleNode.cloneNode(true)));

  head.insertAdjacentHTML(
    "beforeend",
    `
    <style>
      body { font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #ffffff; color: #111827; margin: 0; padding: 2rem; }
      .print-wrapper { max-width: 60rem; margin: 0 auto; }
      @page { margin: 20mm; }
    </style>
  `,
  );

  clone.className = cn(clone.className, "print-wrapper");
  printDocument.body.appendChild(clone);
  printDocument.close();

  const handleLoad = () => {
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  if (printWindow.document.readyState === "complete") {
    handleLoad();
  } else {
    printWindow.onload = handleLoad;
  }
}

export async function downloadElementAsImage(element: HTMLElement, fileName: string) {
  if (typeof window === "undefined") {
    return;
  }

  const { toPng } = await import("html-to-image");
  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    skipFonts: false,
    filter: (domNode) => {
      if (domNode instanceof HTMLElement && domNode.dataset.printHidden === "true") {
        return false;
      }
      return true;
    },
  });

  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.click();
}
