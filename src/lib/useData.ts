import { useEffect, useState } from 'react';
import { buildModel, Model, Payload } from './calc';

async function get(url: string): Promise<Payload | null> {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.series ? (j as Payload) : null;
  } catch { return null; }
}

/** Paint instantly from the build snapshot, then upgrade to live FRED data when the API answers. */
export function useData() {
  const [model, setModel] = useState<Model | null>(null);
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let dead = false;
    (async () => {
      const snap = await get('/data.json');
      if (dead) return;
      if (snap) setModel(buildModel(snap)); else setFailed(true);
      const fresh = await get('/api/data');
      if (dead || !fresh) return;
      if (!snap || fresh.generatedAt > snap.generatedAt) { setModel(buildModel(fresh)); setFailed(false); }
      setLive(true);
    })();
    return () => { dead = true; };
  }, []);
  return { model, live, failed };
}
