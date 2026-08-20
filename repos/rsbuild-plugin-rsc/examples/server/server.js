import express from 'express';
import rsc from './dist/index.js';

const app = express();
const PORT = process.env.PORT || 3000;

// RSC handler middleware
app.use(rsc.nodeHandler);

// Static file serving
app.use(express.static('dist'));

const server = app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => {
    console.log('HTTP server closed');
  });
});
