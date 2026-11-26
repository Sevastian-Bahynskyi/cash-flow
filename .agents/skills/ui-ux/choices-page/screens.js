window.FLOWS = [
  { id: 'demo', name: 'Flow', screens: [
    { id: 'one', name: 'First screen', said: 'One plain line.', variants: [['a', 'A. Name'], ['b', 'B. Name']], html: v => `<div style="padding:80px 24px"><h1>Variant ${v}</h1><button data-next>Next</button></div>` },
    { id: 'two', name: 'Over a photograph', ask: true, html: () => '<div class="shot"><img src="photo.webp" alt=""><svg viewBox="0 0 402 874"></svg></div>' },
  ] },
];
