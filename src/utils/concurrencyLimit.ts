// Caps how many of a given kind of background task run at once — used by
// the artwork palette/smart-crop analyzers, which both load a full-
// resolution image + decode it just to sample a handful of pixels. A page
// like Home can mount dozens of these at the same moment (once R2's CORS
// policy let them stop failing instantly), and without a cap the browser
// tries to fetch + decode all of them in parallel, which is what actually
// stalls the UI — not any single analysis, which is cheap once the image
// is decoded.
const MAX_CONCURRENT = 4;
let active = 0;
const queue: (() => void)[] = [];

function next() {
  if (active >= MAX_CONCURRENT) return;
  const run = queue.shift();
  if (!run) return;
  active++;
  run();
}

export function runLimited<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    queue.push(() => {
      fn()
        .then(resolve, reject)
        .finally(() => {
          active--;
          next();
        });
    });
    next();
  });
}
