const TABS = ['folders', 'browse', 'pdf-extract', 'pdf-merge', 'video-links', 'monitor', 'whatsapp'];

export const TabManager = {
  switch(name) {
    TABS.forEach((t, i) => {
      document.querySelectorAll('.tab')[i]?.classList.toggle('active', t === name);
      document.getElementById('tab-' + t)?.classList.toggle('active', t === name);
    });
  },
};
