import data from './data.js?v=12';
import { findLowestCosts } from './finder.js?v=12';

self.onmessage = ({ data: { version, seed, targets, opts, excluded } }) => {
  const result = findLowestCosts(data.versions[version], seed, targets, opts, excluded, {
    onProgress: progress => self.postMessage({ progress }),
  });
  self.postMessage({ result });
};
