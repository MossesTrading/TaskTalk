// Angka chat belum dibaca ditempel di dua tempat yang kelihatan walau tab tidak aktif:
// judul tab ("(3) TalkTask") dan ikon tab (titik merah + angka).

const APP_ICON = '/TalkTask.png';
const SIZE = 64;

let baseIcon: HTMLImageElement | null = null;
let baseIconReady: Promise<HTMLImageElement> | null = null;

function loadBaseIcon() {
  if (!baseIconReady) {
    baseIconReady = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        baseIcon = image;
        resolve(image);
      };
      image.onerror = reject;
      image.src = APP_ICON;
    });
  }
  return baseIconReady;
}

function iconLink() {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  return link;
}

function drawBadge(image: HTMLImageElement, count: number) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }
  context.drawImage(image, 0, 0, SIZE, SIZE);

  if (count > 0) {
    const label = count > 99 ? '99+' : String(count);
    const radius = 20;
    const cx = SIZE - radius - 1;
    const cy = SIZE - radius - 1;
    // Lingkaran merah Toyota dengan garis putih supaya tetap terbaca di ikon terang.
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fillStyle = '#EB0A1E';
    context.fill();
    context.lineWidth = 4;
    context.strokeStyle = '#FFFFFF';
    context.stroke();

    context.fillStyle = '#FFFFFF';
    context.font = `bold ${label.length > 2 ? 20 : 26}px "Segoe UI", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, cx, cy + 1);
  }

  iconLink().href = canvas.toDataURL('image/png');
}

export function setUnreadBadge(count: number) {
  document.title = count > 0 ? `(${count > 99 ? '99+' : count}) TalkTask` : 'TalkTask';
  const draw = (image: HTMLImageElement) => drawBadge(image, count);
  if (baseIcon) {
    draw(baseIcon);
  } else {
    loadBaseIcon()
      .then(draw)
      .catch(error => console.warn('Gagal menggambar ikon tab', error));
  }
}
