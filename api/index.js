module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.end('Vercel function is alive. Node: ' + process.version);
};
