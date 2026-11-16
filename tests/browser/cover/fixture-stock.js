// Stock pictures for the mocked 09 Cover tests (E16 Part 7). The results are the design's own samples
// (design 63: the 9 see-through Pixabay pictures and its photos), in the stock function's normalized shape
// (supabase/functions/stock/lib.ts StockResult). The pictures are drawn in the page from the design's SVG art and
// gradients, then posted to https://stock-files.test/<source>/<id>; the mock keeps those bytes
// (store.stockFiles) and serves them as the providers' links: pixabay.com/get/g<id>_640|1280.png|jpg and
// images.unsplash.com/photo-<id>. Nothing reaches Pixabay or Unsplash.
const STK = {
  // The design's T art (63-09-cover-images-pixabay.html), as SVG bodies on a 200 × 200 box.
  ART: {
    leaf: "<path d='M40 165 C40 80 100 30 170 30 C170 110 120 165 40 165Z' fill='#4F8A5B'/><path d='M40 165 L140 60' stroke='#2F4A3A' stroke-width='5' fill='none'/>",
    cup: "<path d='M50 80 h90 v60 a35 35 0 0 1 -35 35 h-20 a35 35 0 0 1 -35 -35z' fill='#7A2E2E'/><path d='M140 95 a20 20 0 0 1 0 40' stroke='#7A2E2E' stroke-width='10' fill='none'/><path d='M75 60 c-8 -12 8 -20 0 -35 M100 60 c-8 -12 8 -20 0 -35' stroke='#B8B8B3' stroke-width='5' fill='none' stroke-linecap='round'/>",
    books: "<rect x='35' y='130' width='130' height='24' rx='3' fill='#1F3A5F'/><rect x='45' y='104' width='115' height='24' rx='3' fill='#E0B15A'/><rect x='30' y='78' width='125' height='24' rx='3' fill='#7A2E2E'/><rect x='50' y='52' width='105' height='24' rx='3' fill='#2F4A3A'/>",
    bulb: "<circle cx='100' cy='85' r='50' fill='#F2C14E'/><rect x='80' y='130' width='40' height='30' rx='4' fill='#75756F'/><path d='M100 20 v-12 M45 40 l-9 -9 M155 40 l9 -9' stroke='#F2C14E' stroke-width='6' stroke-linecap='round'/>",
    pencil: "<g transform='rotate(-35 100 100)'><rect x='30' y='88' width='120' height='24' fill='#F2C14E'/><rect x='18' y='88' width='14' height='24' fill='#E07A5F'/><path d='M150 88 L180 100 L150 112z' fill='#EADFC9'/><path d='M170 96 L180 100 L170 104z' fill='#1C1C1A'/></g>",
    clock: "<circle cx='100' cy='108' r='60' fill='#FFFFFF' stroke='#1C1C1A' stroke-width='8'/><path d='M100 108 V70 M100 108 L128 120' stroke='#1C1C1A' stroke-width='7' stroke-linecap='round'/><circle cx='55' cy='45' r='16' fill='#E07A5F'/><circle cx='145' cy='45' r='16' fill='#E07A5F'/>",
    plant: "<path d='M70 130 h60 l-8 50 h-44z' fill='#E07A5F'/><path d='M100 130 C100 90 70 70 50 60 C80 60 100 90 100 130 C100 85 130 60 160 55 C135 75 105 95 100 130' fill='#4F8A5B'/>",
    sparkle: "<path d='M100 20 L112 88 L180 100 L112 112 L100 180 L88 112 L20 100 L88 88z' fill='#F2C14E'/><path d='M160 30 l5 20 l20 5 l-20 5 l-5 20 l-5 -20 l-20 -5 l20 -5z' fill='#E07A5F'/>",
    cap: "<path d='M100 50 L185 90 L100 130 L15 90z' fill='#1C1C1A'/><path d='M55 110 v35 c25 20 65 20 90 0 v-35 l-45 21z' fill='#3D3D39'/><path d='M170 97 v45' stroke='#F2C14E' stroke-width='5'/>"
  },
  // The design's photo gradients (G), as top-to-bottom color stops.
  GRAD: {
    sunrise: ['#F7E1B5', '#EDA46F', '#B5596A', '#3E3557'], forest: ['#CFE3D6', '#7FA88C', '#2F4A3A', '#1D2E25'], sea: ['#DCEBF2', '#8DB7CE', '#2E5E7E', '#1F3A5F'],
    night: ['#3B4A7A', '#151B33'], mist: ['#F2F2F0', '#C9CED3', '#7D8790'], clay: ['#E07A5F', '#F2C14E', '#F2EDE4'], paper: ['#FBF6EC', '#EADFC9', '#D6C6A6']
  },
  // [name (Pixabay tags are lower case), art, width, height, type, transparent]: design 63's order. Widths and heights
  // are the originals; a result shows the size a pick stores (1,280 px on the long side without full API access).
  PIXABAY: [
    ['green leaf', 'leaf', 2400, 2400, 'vector', true], ['coffee cup', 'cup', 3000, 3000, 'illustration', true],
    ['stack of books', 'books', 3200, 3200, 'vector', true], ['light bulb', 'bulb', 2600, 2600, 'illustration', true],
    ['pencil', 'pencil', 2800, 2800, 'vector', true], ['alarm clock', 'clock', 2500, 2500, 'illustration', true],
    ['potted plant', 'plant', 2400, 2400, 'vector', true], ['sparkles', 'sparkle', 2000, 2000, 'vector', true],
    ['graduation cap', 'cap', 3000, 3000, 'illustration', true],
    ['sunrise over a desk', 'sunrise', 5472, 3648, 'photo', false], ['forest path', 'forest', 6000, 4000, 'photo', false],
    ['calm sea', 'sea', 4928, 3264, 'photo', false], ['night sky', 'night', 4000, 6000, 'photo', false]
  ],
  UNSPLASH: [
    ['warm abstract', 'clay', 6000, 4000, 'Mara Lind'], ['calm sea', 'sea', 5760, 3840, 'Bo Kim'], ['forest path', 'forest', 6720, 4480, 'Ana Ruiz'],
    ['night sky', 'night', 3648, 5472, 'Lee Park'], ['morning mist', 'mist', 5000, 3333, 'Sam Ode'], ['sunrise over a desk', 'sunrise', 6000, 4000, 'Ivy Chen'],
    ['warm paper', 'paper', 5472, 3648, 'Tom Hale']
  ],
  fit(w, h, long) { const m = Math.max(w, h); if (m <= long) return [w, h]; const k = long / m; return [Math.round(w * k), Math.round(h * k)]; },
  pixId: (i) => String(1000 + i),
  unId: (i) => `u${i}AbC`,
  /** The search results of a source, in the function's shape. */
  results(source) {
    if (source === 'pixabay') {
      return STK.PIXABAY.map(([name, art, w, h, type, transparent], i) => {
        const id = STK.pixId(i), ext = transparent ? 'png' : 'jpg', [sw, sh] = STK.fit(w, h, 1280);
        return { id, source, name, thumb: `https://pixabay.com/get/g${id}_640.${ext}`, preview: `https://pixabay.com/get/g${id}_1280.${ext}`, width: sw, height: sh, type, transparent,
          author: 'Ann Lee', authorUrl: 'https://pixabay.com/users/ann-lee-42/', pageUrl: `https://pixabay.com/${type === 'photo' ? 'photos' : type + 's'}/${name.replace(/ /g, '-')}-${id}/` };
      });
    }
    return STK.UNSPLASH.map(([name, art, w, h, author], i) => {
      const id = STK.unId(i);
      return { id, source, name, thumb: `https://images.unsplash.com/photo-${id}?ixid=t&w=400`, preview: `https://images.unsplash.com/photo-${id}?ixid=t&w=1080`, width: w, height: h,
        type: 'photo', transparent: false, author, authorUrl: `https://unsplash.com/@${author.split(' ')[0].toLowerCase()}`, pageUrl: `https://unsplash.com/photos/${id}` };
    });
  },
  /** The raw hotlink a pick stores for an Unsplash result. */
  raw: (id) => `https://images.unsplash.com/photo-${id}?ixid=t`,
  /**
   * Draws every sample in the page (Pixabay: the 1,280 px file a pick stores; Unsplash: a 1,200 px photo) and posts
   * the bytes to the mock. Call after CV.open (or any page load of the app).
   */
  ready: (page) => page.evaluate(async ([art, grad, pix, un]) => {
    async function draw(w, h, o) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d');
      if (o.art) {
        const img = new Image();
        img.src = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' width='${w}' height='${h}'>${o.art}</svg>`);
        await img.decode();
        g.drawImage(img, 0, 0, w, h);
      } else {
        const lg = g.createLinearGradient(0, 0, 0, h);
        o.stops.forEach((col, i) => lg.addColorStop(i / Math.max(1, o.stops.length - 1), col));
        g.fillStyle = lg; g.fillRect(0, 0, w, h);
      }
      const blob = await new Promise((r) => c.toBlob(r, o.png ? 'image/png' : 'image/jpeg', 0.85));
      c.width = 0;
      return blob;
    }
    const post = (path, blob) => fetch(`https://stock-files.test/${path}`, { method: 'POST', body: blob, headers: { 'content-type': blob.type } });
    let n = 0;
    for (let i = 0; i < pix.length; i++) {
      const [, key, w, h, , clear] = pix[i];
      const k = 1280 / Math.max(w, h), sw = Math.round(w * Math.min(1, k)), sh = Math.round(h * Math.min(1, k));
      await post(`pixabay/${1000 + i}`, await draw(sw, sh, clear ? { art: art[key], png: true } : { stops: grad[key] })); n++;
    }
    for (let i = 0; i < un.length; i++) {
      const [, key, w, h] = un[i];
      const k = 1200 / Math.max(w, h);
      await post(`unsplash/u${i}AbC`, await draw(Math.round(w * k), Math.round(h * k), { stops: grad[key] })); n++;
    }
    return n;
  }, [STK.ART, STK.GRAD, STK.PIXABAY, STK.UNSPLASH])
};
