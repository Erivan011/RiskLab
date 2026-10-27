import { analyze } from "./risk-engine.mjs";
self.onmessage = (event) => {
  try {
    self.postMessage({ id: event.data.id, result: analyze(event.data.input) });
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error.message });
  }
};
