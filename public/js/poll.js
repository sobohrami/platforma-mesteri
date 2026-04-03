(function () {
  var id = window.__convId;
  if (!id) return;
  var last = null;
  setInterval(function () {
    fetch('/api/mesaje/' + id + '/nou')
      .then(function (r) {
        return r.json();
      })
      .then(function (d) {
        if (d && d.lastId && last !== null && d.lastId !== last) {
          location.reload();
        }
        if (d && last === null) last = d.lastId;
        else if (d) last = d.lastId;
      })
      .catch(function () {});
  }, 8000);
})();
