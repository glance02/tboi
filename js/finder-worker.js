// Runs findRecipes() off the main thread; the full search takes a few seconds.
import data from './data.js?v=12';
import { findRecipes } from './finder.js?v=12';

self.onmessage = ({ data: { version, seed, target, opts } }) => {
  const result = findRecipes(data.versions[version], seed, target, opts, {
    onProgress: done => self.postMessage({ progress: done }),
  });
  self.postMessage({ result }, [result.packed.buffer]);
};
