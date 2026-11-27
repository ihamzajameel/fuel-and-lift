// "Photo" button: snap a meal, the bot's Claude vision estimates it, the result prefills the food logger.
import { useRef, useState } from 'react';
import { Camera, LoaderCircle } from 'lucide-react';
import { useStore } from '../lib/store';
import { useApp } from '../lib/app-context';
import { botApi } from '../lib/sync';
import { Button } from './ui';

// Shrink the photo on the phone (max 1280 px JPEG) before sending it for analysis.
async function toJpeg(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
  const dataUrl = await new Promise((r) => {
    const fr = new FileReader();
    fr.onload = () => r(fr.result);
    fr.readAsDataURL(blob);
  });
  return String(dataUrl).split(',')[1];
}

/** onEstimate({ initial, estimate }) is called with values ready for FoodSheet. */
export default function PhotoButton({ onEstimate, size = 'sm', className, label = 'Photo' }) {
  const { state } = useStore();
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);
  const tg = state.meta.tg || {};

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const image = await toJpeg(file);
      const { estimate: est } = await botApi(tg.url, '/api/estimate', { method: 'POST', body: { image, mediaType: 'image/jpeg' } });
      if (!est.is_food) return toast("That doesn't look like food. Try another photo.");
      const t = est.total;
      onEstimate({ initial: { name: est.meal_name, qty: 1, unit: 'serving', kcal: t.kcal, p: t.protein_g, c: t.carbs_g, f: t.fat_g }, estimate: est });
    } catch (err) {
      toast(err.code === 'vision_not_configured' ? 'Photo logging needs the API key on the bot server.' : `Couldn't analyse the photo: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size={size}
        icon={busy ? LoaderCircle : Camera}
        disabled={busy}
        className={[busy ? '[&_svg]:animate-spin' : '', className].filter(Boolean).join(' ')}
        aria-label="Log food from a photo"
        onClick={() => {
          if (!tg.paired || !tg.url) return toast('Photo logging runs on your bot. Connect Telegram first (More → Reminders).');
          ref.current?.click();
        }}
      >
        {busy ? 'Reading…' : label}
      </Button>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
    </>
  );
}
